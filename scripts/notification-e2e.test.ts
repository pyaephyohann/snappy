/**
 * N4 — Full notification lifecycle E2E against the real application.
 *
 * No browser-E2E framework exists in this repository (audited: no Playwright,
 * Cypress, Puppeteer, or server-start harness), so N4 extends the established
 * DATABASE_URL-guarded node:test convention to the strongest boundary the
 * environment can reach without new dependencies:
 *
 *   real login (POST /api/auth/login, bcrypt passcode, session cookie)
 *     → real Next.js server (next build + next start as a child process,
 *        ephemeral AUTH_SECRET/VAPID — a built server is immune to the
 *        file-change recompiles a dev server would pick up mid-run)
 *       → real API routes (follow, chats, messages, reaction, comment,
 *          notifications list/read/read-all/unread-count, preferences,
 *          subscribe)
 *         → real notification service + N1 preference evaluation
 *           → real web-push transport (web-push + VAPID signing)
 *             → local TLS push receiver capturing real sendNotification
 *               attempts (VAPID Authorization key/JWT + encrypted body)
 *
 * External push providers and physical devices cannot be exercised here.
 * Browser/device-level Web Push delivery was NOT tested against a real
 * external push service; the delivery boundary proven here is the server's
 * real sendNotification call reaching a real HTTPS endpoint. The delivered
 * body is RFC 8291 ciphertext, so plaintext payload content is asserted at
 * the sendNotification boundary in pwa-push.test.ts instead of re-decrypting
 * what the web-push library already encrypts.
 *
 * Invariants proven together:
 *   N1: push mute != notification deletion (row + unread survive, 0 attempts)
 *   N2: unread count = unread DB rows (API response === database count)
 *   N3: visual groups != database rows (lossless; group read = per-row PATCH)
 *   Chat: lastReadAt != Notification.readAt
 *
 * Safety: run-scoped n4e2e_<runId> users only; cleanup deletes exactly those
 * users (cascades) and this run's push subscriptions by endpoint prefix. The
 * child server receives test-only AUTH_SECRET/VAPID values generated per run
 * — no production credentials are read or used, and nothing is sent to real
 * push services or real users.
 *
 * Opt-in: spawning a real dev server is heavyweight, so the suite runs only
 * when N4_E2E=1 is set alongside DATABASE_URL.
 *
 * Run: N4_E2E=1 node --env-file-if-exists=.env.local --import tsx --test scripts/notification-e2e.test.ts
 */

import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import crypto from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import https from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { promisify } from "node:util";
import type { Prisma, PrismaClient } from "@prisma/client";
import { groupNotifications } from "../lib/notifications/notification-grouping";

const execFileAsync = promisify(execFile);

const hasDatabase = Boolean(process.env.DATABASE_URL);
const runEnabled = process.env.N4_E2E === "1";
const SKIP: string | false = hasDatabase
  ? runEnabled
    ? false
    : "set N4_E2E=1 to run the full notification E2E (starts a real dev server)"
  : "DATABASE_URL not set";

const runId = `n4e2e_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const root = process.cwd();

type User = { id: string; name: string };

// ===========================================================================
// Push receiver: a real HTTPS endpoint the real server delivers to
// ===========================================================================

type PushAttempt = {
  device: string;
  authHeader: boolean;
  authorization: string;
  payload: string;
};

function createPushReceiver(certDir: string) {
  const attempts: PushAttempt[] = [];
  const server = https.createServer(
    {
      key: readFileSync(join(certDir, "key.pem")),
      cert: readFileSync(join(certDir, "cert.pem")),
    },
    (request, response) => {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        const match = /\/push\/([A-Za-z0-9_-]+)/.exec(request.url ?? "");
        attempts.push({
          device: match?.[1] ?? "unknown",
          authHeader: Boolean(request.headers.authorization),
          authorization: request.headers.authorization ?? "",
          payload: body,
        });
        // 404/410 would delete the subscription row server-side; 201 keeps
        // the device deliverable for later steps.
        response.writeHead(201);
        response.end();
      });
    },
  );

  return {
    attempts,
    start: () =>
      new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve());
      }),
    port: () => (server.address() as { port: number }).port,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
    /** Bounded wait until at least `count` cumulative attempts arrived. */
    waitForCount: async (count: number, label: string) => {
      const deadline = Date.now() + 20_000;
      while (attempts.length < count) {
        if (Date.now() > deadline) {
          throw new Error(
            `push attempts: expected ${count}, saw ${attempts.length} (${label})`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    },
  };
}

/** Bounded settle used only for negative (zero-attempt) assertions. */
async function settle(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// ===========================================================================
// Real dev server child process
// ===========================================================================

/** Build once up front: production output has no lazy route compiles. */
async function buildNextServer(): Promise<void> {
  try {
    await execFileAsync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
      cwd: root,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; message?: string };
    throw new Error(
      `next build failed:\n${failure.stdout ?? ""}${failure.stderr ?? failure.message ?? ""}`,
    );
  }
}

function startNextServer(port: number, authSecret: string, vapid: { publicKey: string; privateKey: string }) {
  const child = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", String(port)],
    {
      cwd: root,
      env: {
        ...process.env,
        AUTH_SECRET: authSecret,
        VAPID_PUBLIC_KEY: vapid.publicKey,
        VAPID_PRIVATE_KEY: vapid.privateKey,
        VAPID_SUBJECT: VAPID_SUBJECT,
        // Lets the real web-push client reach the self-signed local receiver.
        // Scoped to this child process only.
        NODE_TLS_REJECT_UNAUTHORIZED: "0",
        NEXT_TELEMETRY_DISABLED: "1",
        PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const logs: string[] = [];
  const capture = (chunk: Buffer) => {
    logs.push(chunk.toString());
    if (logs.length > 400) logs.splice(0, logs.length - 400);
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  return {
    child,
    logTail: () => logs.join("").slice(-4000),
    stop: async () => {
      if (child.exitCode !== null) return;
      child.kill("SIGTERM");
      const deadline = Date.now() + 8_000;
      while (child.exitCode === null && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (child.exitCode === null) child.kill("SIGKILL");
    },
  };
}

async function waitForServer(port: number, logTail: () => string): Promise<void> {
  const deadline = Date.now() + 60_000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/api/notifications/unread-count`,
        { signal: AbortSignal.timeout(5_000) },
      );
      // Any HTTP response (even 401) proves the server is serving the API.
      await response.arrayBuffer();
      if (response.status > 0) return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(
    `dev server did not come up in time: ${lastError}\n--- server log tail ---\n${logTail()}`,
  );
}

async function getFreePort(): Promise<number> {
  const net = await import("node:net");
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const free =
        address && typeof address === "object" ? address.port : 0;
      server.close(() => (free ? resolve(free) : reject(new Error("no port"))));
    });
  });
}

// ===========================================================================
// Real login + API helpers
// ===========================================================================

type Session = { cookie: string; user: User };

async function login(port: number, user: User, passcode: string): Promise<Session> {
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ passcode }),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  assert.equal(response.status, 200, `login should succeed: ${text}`);
  const setCookie = response.headers.getSetCookie().find((c) => c.startsWith("snappy_session="));
  assert.ok(setCookie, "login must set the snappy_session cookie");
  return { cookie: setCookie.split(";")[0], user };
}

type ApiResult<T> = { status: number; body: T | null; text: string };

async function api<T>(
  session: Session | null,
  port: number,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(session ? { cookie: session.cookie } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  let body: T | null = null;
  if (text) {
    try {
      body = JSON.parse(text) as T;
    } catch {
      body = null;
    }
  }
  return { status: response.status, body, text };
}

/** Bounded DB polling for fire-and-forget notification writes — no sleeps. */
async function waitFor(label: string, query: () => Promise<number>, expected: number): Promise<void> {
  const deadline = Date.now() + 20_000;
  let seen = -1;
  while (Date.now() < deadline) {
    seen = await query();
    if (seen >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`${label}: expected >= ${expected}, last saw ${seen}`);
}

async function unreadApi(session: Session, port: number): Promise<number> {
  const result = await api<{ count: number }>(session, port, "/api/notifications/unread-count");
  assert.equal(result.status, 200, "unread-count must answer 200 for a session");
  assert.ok(result.body, "unread-count must return a body");
  return result.body.count;
}

async function unreadDb(userId: string): Promise<number> {
  return getDb().notification.count({ where: { userId, readAt: null } });
}

/** N2 invariant: the API count equals the database row count, always. */
async function assertUnreadMatchesDb(session: Session, port: number, label: string): Promise<number> {
  const apiCount = await unreadApi(session, port);
  const dbCount = await unreadDb(session.user.id);
  assert.equal(apiCount, dbCount, `${label}: API unread count must equal DB rows`);
  return apiCount;
}

type NotificationType =
  | "NEW_SNAP"
  | "NEW_MESSAGE"
  | "REACTION"
  | "COMMENT"
  | "BIRTHDAY"
  | "FOLLOW"
  | "FOLLOW_ACCEPTED";

type NotificationListItem = {
  id: string;
  type: NotificationType;
  actor: { name: string; image: string };
  snapId: string | null;
  snapOwnerName: string | null;
  conversationId: string | null;
  body: string | null;
  read: boolean;
  createdAt: string;
};

async function listNotifications(
  session: Session,
  port: number,
  cursor?: string,
): Promise<{ items: NotificationListItem[]; nextCursor: string | null }> {
  const path = cursor
    ? `/api/notifications?cursor=${encodeURIComponent(cursor)}`
    : "/api/notifications";
  const result = await api<{ notifications: NotificationListItem[]; nextCursor: string | null }>(
    session,
    port,
    path,
  );
  assert.equal(result.status, 200, `list must answer 200: ${result.text}`);
  assert.ok(result.body, "list must return a body");
  return { items: result.body.notifications, nextCursor: result.body.nextCursor };
}

// ===========================================================================
// Push attempt bookkeeping (cumulative across the run)
// ===========================================================================

let receiver: ReturnType<typeof createPushReceiver> | null = null;
let pushSeen = 0;

function getReceiver(): ReturnType<typeof createPushReceiver> {
  assert.ok(receiver, "push receiver is running");
  return receiver;
}

/**
 * Assert exactly `n` new real push attempts arrived since the last check.
 * `devices` (optional) names the expected endpoint paths, sorted.
 */
async function expectPushes(n: number, label: string, devices?: string[]): Promise<void> {
  const target = pushSeen + n;
  if (n > 0) {
    await getReceiver().waitForCount(target, label);
  } else {
    // Negative assertion: give the fire-and-forget path a bounded window.
    await settle(1_500);
  }
  assert.equal(getReceiver().attempts.length, target, `${label}: unexpected push attempt count`);
  if (devices) {
    const actual = getReceiver()
      .attempts.slice(pushSeen)
      .map((attempt) => attempt.device)
      .sort();
    assert.deepEqual(actual, [...devices].sort(), `${label}: pushed devices`);
  }
  pushSeen = target;
}

/**
 * Transport-level evidence for the latest real push attempt. The body is
 * aes128gcm ciphertext (RFC 8291) — its plaintext content is asserted at the
 * sendNotification boundary in pwa-push.test.ts, so here we prove VAPID
 * signing (key + JWT claims) and that an encrypted payload was delivered.
 */
function assertVapidDelivery(label: string): void {
  const attempts = getReceiver().attempts;
  assert.ok(attempts.length > 0, `${label}: a push attempt must exist`);
  const latest = attempts[attempts.length - 1];
  assert.ok(latest.authHeader, `${label}: VAPID Authorization header required`);
  assert.ok(
    latest.authorization.includes(`k=${vapidPublicKey}`),
    `${label}: Authorization carries this run's VAPID public key`,
  );
  const token = /t=([^,\s]+)/.exec(latest.authorization)?.[1];
  assert.ok(token, `${label}: VAPID JWT present`);
  const claims = JSON.parse(
    Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
  ) as { sub?: string; aud?: string; exp?: number };
  assert.equal(claims.sub, VAPID_SUBJECT, `${label}: VAPID subject claim`);
  assert.ok(claims.aud, `${label}: VAPID audience claim`);
  assert.ok(typeof claims.exp === "number", `${label}: VAPID expiry claim`);
  assert.ok(latest.payload.length > 50, `${label}: encrypted payload delivered`);
}

// ===========================================================================
// Fixtures
// ===========================================================================

let prisma: PrismaClient | null = null;
function getDb(): PrismaClient {
  assert.ok(prisma, "database client is available");
  return prisma;
}

const createdUserIds: string[] = [];
let certDir = "";
let receiverBase = "";

let serverPort = 0;
let serverHandle: ReturnType<typeof startNextServer> | null = null;
let alice: User;
let bob: User;
let charlie: User;
let aliceSession: Session;
let bobSession: Session;
let charlieSession: Session;
let snapId = "";
let conversationId = "";
let vapidPublicKey = "";

const VAPID_SUBJECT = "mailto:n4e2e@test.local";
const ALICE_DEVICES = ["aliceDevA", "aliceDevB", "aliceDevC"];

async function createUser(label: string): Promise<User> {
  const user = await getDb().user.create({
    data: {
      name: `${runId}_${label}`,
      profileImage: "https://example.com/n4e2e.jpg",
      isActive: true,
    },
    select: { id: true, name: true },
  });
  createdUserIds.push(user.id);
  return user;
}

/** ECDH keys for a fake device subscription (accepted by web-push). */
function deviceKeys() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    p256dh: ecdh.getPublicKey("base64url"),
    auth: crypto.randomBytes(16).toString("base64url"),
  };
}

async function subscribeDevice(session: Session, device: string, endpointPath: string): Promise<void> {
  const result = await api<{ success: boolean }>(session, serverPort, "/api/notifications/subscribe", {
    method: "POST",
    body: {
      deviceId: crypto.randomUUID(),
      endpoint: `${receiverBase}${endpointPath}`,
      keys: deviceKeys(),
    },
  });
  assert.equal(result.status, 200, `subscribe ${device}: ${result.text}`);
}

async function markRead(session: Session, notificationId: string): Promise<number> {
  const result = await api<{ read?: boolean; error?: string }>(
    session,
    serverPort,
    `/api/notifications/${notificationId}/read`,
    { method: "PATCH" },
  );
  return result.status;
}

async function markGroupRead(session: Session, ids: string[]): Promise<void> {
  // The client's group-read mechanism: one PATCH per unread member through the
  // existing per-notification API (N3 handleOpenGroup behavior).
  for (const id of ids) {
    assert.equal(await markRead(session, id), 200, `group member ${id} must become read`);
  }
}

async function notificationRows(userId: string, where: Prisma.NotificationWhereInput = {}) {
  return getDb().notification.findMany({
    where: { userId, ...where },
    orderBy: { createdAt: "desc" },
  });
}

before(async () => {
  if (SKIP) return;

  const { PrismaClient: Client } = await import("@prisma/client");
  prisma = new Client();
  await prisma.$queryRaw`SELECT 1`;

  // --- Fixtures: isolated users + Alice's snap ----------------------------
  alice = await createUser("alice");
  bob = await createUser("bob");
  charlie = await createUser("charlie");

  const snap = await getDb().snap.create({
    data: {
      imageUrl: "https://example.com/n4e2e-snap.jpg",
      publicId: `${runId}_snap`,
      userId: alice.id,
    },
    select: { id: true },
  });
  snapId = snap.id;

  // --- Ephemeral credentials for the child server ------------------------
  const webpushModule = await import("web-push");
  const webpush = webpushModule.default ?? webpushModule;
  const vapidKeys = webpush.generateVAPIDKeys();
  vapidPublicKey = vapidKeys.publicKey;
  const authSecret = crypto.randomBytes(48).toString("hex");

  // --- Local TLS push receiver -------------------------------------------
  certDir = mkdtempSync(join(tmpdir(), "n4e2e-cert-"));
  await execFileAsync("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    join(certDir, "key.pem"),
    "-out",
    join(certDir, "cert.pem"),
    "-subj",
    "/CN=127.0.0.1",
    "-days",
    "1",
  ]);
  receiver = createPushReceiver(certDir);
  await getReceiver().start();
  receiverBase = `https://127.0.0.1:${getReceiver().port()}`;

  // --- Real server: build once, then start -------------------------------
  await buildNextServer();
  serverPort = await getFreePort();
  serverHandle = startNextServer(serverPort, authSecret, vapidKeys);
  await waitForServer(serverPort, () => serverHandle!.logTail());

  // --- Real logins --------------------------------------------------------
  const bcrypt = (await import("bcryptjs")).default;
  const alicePass = `n4-alice-${runId.slice(-6)}`;
  const bobPass = `n4-bob-${runId.slice(-6)}`;
  const charliePass = `n4-charlie-${runId.slice(-6)}`;
  await getDb().user.update({
    where: { id: alice.id },
    data: { passcodeHash: await bcrypt.hash(alicePass, 10) },
  });
  await getDb().user.update({
    where: { id: bob.id },
    data: { passcodeHash: await bcrypt.hash(bobPass, 10) },
  });
  await getDb().user.update({
    where: { id: charlie.id },
    data: { passcodeHash: await bcrypt.hash(charliePass, 10) },
  });
  aliceSession = await login(serverPort, alice, alicePass);
  bobSession = await login(serverPort, bob, bobPass);
  charlieSession = await login(serverPort, charlie, charliePass);
});

after(async () => {
  if (serverHandle) {
    // Always surface the server log tail: it carries route-level errors that
    // explain failed assertions above.
    const tail = serverHandle.logTail().trim();
    if (tail) {
      console.error(`--- server log tail ---\n${tail}\n--- end server log ---`);
    }
    await serverHandle.stop();
    serverHandle = null;
  }
  if (receiver) {
    await receiver.close();
    receiver = null;
  }
  if (certDir) {
    rmSync(certDir, { recursive: true, force: true });
  }
  if (prisma) {
    // Remove this run's push subscriptions by this run's endpoint prefix
    // before user deletion nulls the owner.
    if (receiverBase) {
      await prisma.pushSubscription.deleteMany({
        where: { endpoint: { startsWith: `${receiverBase}/push/` } },
      });
    }
    if (createdUserIds.length > 0) {
      // Cascades remove follows, snaps, conversations, messages, comments,
      // reactions, notifications, preferences.
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  }
});

// ===========================================================================
// E2E flows
// ===========================================================================

test("login, default preferences, and push device registration through the real API", { skip: SKIP }, async () => {
  // Unauthenticated access is rejected by the real route boundary.
  // (requireSession() throws on a missing session and the route catch maps it
  // to 500 — pre-existing behavior outside N4 scope; either way no data.)
  const anon = await api<{ error?: string; count?: number }>(
    null,
    serverPort,
    "/api/notifications/unread-count",
  );
  assert.ok(anon.status >= 400, `no session -> rejected (got ${anon.status})`);
  assert.equal(anon.body?.count, undefined, "no count without a session");

  // Default preferences are all enabled (missing row = enabled).
  const prefs = await api<Record<string, boolean>>(aliceSession, serverPort, "/api/notifications/preferences");
  assert.equal(prefs.status, 200, "preferences GET must answer");
  assert.equal(prefs.body?.reaction, true);
  assert.equal(prefs.body?.comment, true);
  assert.equal(prefs.body?.follow, true);

  // Three devices for Alice, one for Bob — registered through the real
  // subscribe API (multi-device setup for the N1 mute test).
  for (const device of ALICE_DEVICES) {
    await subscribeDevice(aliceSession, device, `/push/${device}`);
  }
  await subscribeDevice(bobSession, "bobDevA", "/push/bobDevA");

  const rows = await getDb().pushSubscription.findMany({
    where: { endpoint: { startsWith: `${receiverBase}/push/` } },
  });
  assert.equal(
    rows.filter((row) => row.userId === alice.id).length,
    3,
    "Alice owns three subscriptions",
  );
  assert.equal(
    rows.filter((row) => row.userId === bob.id).length,
    1,
    "Bob owns one subscription",
  );
  assert.equal(rows.every((row) => row.endpoint.startsWith(receiverBase)), true);
});

test("FOLLOW: Bob follows Alice — row, notification, unread, push, open, read, idempotent retry", { skip: SKIP }, async () => {
  assert.equal(await assertUnreadMatchesDb(aliceSession, serverPort, "before follow"), 0);

  const follow = await api<unknown>(bobSession, serverPort, `/api/users/${alice.id}/follow`, {
    method: "POST",
  });
  assert.equal(follow.status, 200, `follow must answer 200: ${follow.text}`);

  await waitFor(
    "FOLLOW notification row",
    async () =>
      getDb().notification.count({
        where: { type: "FOLLOW", userId: alice.id, actorId: bob.id, readAt: null },
      }),
    1,
  );
  const [followRow] = await notificationRows(alice.id, { type: "FOLLOW" });
  assert.ok(followRow);
  assert.equal(followRow.userId, alice.id, "recipient is Alice");
  assert.equal(followRow.actorId, bob.id, "actor is Bob");
  assert.equal(followRow.readAt, null, "fresh notification is unread");
  assert.equal(followRow.snapId, null);

  // Real push delivery: 3 devices, VAPID-signed transport.
  await expectPushes(3, "follow push", ["aliceDevA", "aliceDevB", "aliceDevC"]);
  assertVapidDelivery("follow push");

  // Unread badge (N2): API count === DB rows, now 1.
  assert.equal(await assertUnreadMatchesDb(aliceSession, serverPort, "after follow"), 1);

  // The list shows it with the destination fields the client routes on.
  const { items } = await listNotifications(aliceSession, serverPort);
  const listItem = items.find((item) => item.id === followRow.id);
  assert.ok(listItem, "notification visible in the list API");
  assert.equal(listItem.actor.name, bob.name);
  assert.equal(listItem.read, false);

  // Master flow: Alice opens it -> read -> badge decreases.
  assert.equal(await markRead(aliceSession, followRow.id), 200);
  assert.equal(await assertUnreadMatchesDb(aliceSession, serverPort, "after open"), 0);
  // Already-read rows stay 404 (updateMany scoped to readAt: null).
  assert.equal(await markRead(aliceSession, followRow.id), 404);

  // Idempotency: a retried follow never duplicates the notification.
  const retry = await api<unknown>(bobSession, serverPort, `/api/users/${alice.id}/follow`, {
    method: "POST",
  });
  assert.equal(retry.status, 200, "duplicate follow is idempotent");
  await settle(700);
  const followCount = await getDb().notification.count({
    where: { type: "FOLLOW", userId: alice.id, actorId: bob.id },
  });
  assert.equal(followCount, 1, "exactly one FOLLOW notification despite the retry");
  assert.equal(await assertUnreadMatchesDb(aliceSession, serverPort, "after retry"), 0);
  assert.equal(getReceiver().attempts.length, 3, "retry never re-sends push");
});

test("FOLLOW_ACCEPTED: Alice follows back — exactly one acceptance, unread isolation, cross-user 404", { skip: SKIP }, async () => {
  const back = await api<unknown>(aliceSession, serverPort, `/api/users/${bob.id}/follow`, {
    method: "POST",
  });
  assert.equal(back.status, 200, `follow back must answer 200: ${back.text}`);

  await waitFor(
    "FOLLOW_ACCEPTED notification row",
    async () =>
      getDb().notification.count({
        where: { type: "FOLLOW_ACCEPTED", userId: bob.id, actorId: alice.id, readAt: null },
      }),
    1,
  );

  // The acceptance transition produces ONLY FOLLOW_ACCEPTED — never both.
  const bobFollowRows = await getDb().notification.count({
    where: { type: "FOLLOW", userId: bob.id },
  });
  assert.equal(bobFollowRows, 0, "no plain FOLLOW for the acceptance transition");
  const bobAccepted = await notificationRows(bob.id, { type: "FOLLOW_ACCEPTED" });
  assert.equal(bobAccepted.length, 1, "exactly one acceptance notification");
  assert.equal(bobAccepted[0].actorId, alice.id, "actor is Alice (the accepting follower)");
  assert.equal(bobAccepted[0].readAt, null, "unread for Bob");

  // Push to Bob's device with VAPID-signed transport (payload content is
  // locked at the sendNotification boundary in pwa-push.test.ts).
  await expectPushes(1, "follow-accepted push", ["bobDevA"]);
  assertVapidDelivery("follow-accepted push");

  // N2 unread isolation: Alice 0 vs Bob 1 through the same API.
  assert.equal(await assertUnreadMatchesDb(aliceSession, serverPort, "alice isolation"), 0);
  assert.equal(await assertUnreadMatchesDb(bobSession, serverPort, "bob isolation"), 1);

  // Authorization: Alice cannot mark Bob's notification read (owner-scoped).
  assert.equal(await markRead(aliceSession, bobAccepted[0].id), 404, "cross-user mark-read rejected");
  const stillUnread = await getDb().notification.findUnique({
    where: { id: bobAccepted[0].id },
    select: { readAt: true },
  });
  assert.equal(stillUnread?.readAt, null, "row untouched after the rejected attempt");
  // Bob can read his own.
  assert.equal(await markRead(bobSession, bobAccepted[0].id), 200);
  assert.equal(await assertUnreadMatchesDb(bobSession, serverPort, "bob after open"), 0);
});

test("NEW_MESSAGE: real chat + message — messageId link, destination, push, readAt vs lastReadAt", { skip: SKIP }, async () => {
  // Conversation through the real chat API (mutual follows now exist).
  const created = await api<{ conversationId: string }>(bobSession, serverPort, "/api/chats", {
    method: "POST",
    body: { userId: alice.id },
  });
  assert.equal(created.status, 200, `chat create: ${created.text}`);
  assert.ok(created.body?.conversationId, "conversation id returned");
  conversationId = created.body!.conversationId;

  const content = `n4 e2e message ${runId}`;
  const sent = await api<{ message: { id: string } }>(
    bobSession,
    serverPort,
    `/api/chats/${conversationId}/messages`,
    { method: "POST", body: { content } },
  );
  assert.equal(sent.status, 200, `message send: ${sent.text}`);
  const messageId = sent.body!.message.id;

  // The message row exists and the notification links it exactly once.
  await waitFor(
    "NEW_MESSAGE notification",
    async () =>
      getDb().notification.count({
        where: { type: "NEW_MESSAGE", userId: alice.id, messageId },
      }),
    1,
  );
  const [messageRow] = await notificationRows(alice.id, { type: "NEW_MESSAGE" });
  assert.ok(messageRow);
  assert.equal(messageRow.actorId, bob.id);
  assert.equal(messageRow.messageId, messageId, "messageId linkage is correct");
  assert.equal(messageRow.body, content, "preview matches the message");
  assert.equal(messageRow.readAt, null);

  // Push with VAPID-signed transport to all three devices.
  await expectPushes(3, "message push", ["aliceDevA", "aliceDevB", "aliceDevC"]);
  assertVapidDelivery("message push");

  // List payload carries the destination fields the client routes on.
  const { items } = await listNotifications(aliceSession, serverPort);
  const listItem = items.find((item) => item.id === messageRow.id);
  assert.ok(listItem, "message notification visible");
  assert.equal(listItem.conversationId, conversationId, "conversationId drives /chats/{id}");
  assert.equal(listItem.actor.name, bob.name);
  assert.equal(listItem.body, content);
  assert.equal(await assertUnreadMatchesDb(aliceSession, serverPort, "after message"), 1);

  // Chat read state is independent: notification read leaves lastReadAt null.
  const participantsBefore = await getDb().conversationParticipant.findMany({
    where: { conversationId },
    select: { userId: true, lastReadAt: true },
  });
  assert.ok(participantsBefore.every((p) => p.lastReadAt === null), "chat untouched so far");

  assert.equal(await markRead(aliceSession, messageRow.id), 200);
  assert.equal(await assertUnreadMatchesDb(aliceSession, serverPort, "after message open"), 0);

  const participantsAfter = await getDb().conversationParticipant.findMany({
    where: { conversationId },
    select: { userId: true, lastReadAt: true },
    orderBy: { userId: "asc" },
  });
  assert.deepEqual(
    participantsAfter.map((p) => p.lastReadAt),
    [null, null],
    "Notification.readAt never touches ConversationParticipant.lastReadAt",
  );
});

test("REACTION: Bob reacts to Alice's Snap — row, emoji body, push, UI destination", { skip: SKIP }, async () => {
  const reaction = await api<{ reaction: { type: string } | null }>(
    bobSession,
    serverPort,
    `/api/snaps/${snapId}/reaction`,
    { method: "POST", body: { type: "LOVE" } },
  );
  assert.equal(reaction.status, 200, `reaction: ${reaction.text}`);
  assert.equal(reaction.body?.reaction?.type, "LOVE");

  await waitFor(
    "REACTION notification",
    async () =>
      getDb().notification.count({
        where: { type: "REACTION", userId: alice.id, actorId: bob.id, snapId },
      }),
    1,
  );
  const reactionRows = await notificationRows(alice.id, { type: "REACTION" });
  assert.equal(reactionRows.length, 1);
  assert.equal(reactionRows[0].body, "❤️", "REACTION body holds the reaction emoji");
  assert.equal(reactionRows[0].readAt, null);

  await expectPushes(3, "reaction push", ["aliceDevA", "aliceDevB", "aliceDevC"]);
  assertVapidDelivery("reaction push");

  assert.equal(await assertUnreadMatchesDb(aliceSession, serverPort, "after reaction"), 1);

  // UI destination data: snapOwnerName routes to /friends/{owner}.
  const { items } = await listNotifications(aliceSession, serverPort);
  const listItem = items.find((item) => item.id === reactionRows[0].id);
  assert.ok(listItem);
  assert.equal(listItem.snapOwnerName, alice.name, "snap owner drives the destination");
  assert.equal(listItem.snapId, snapId);
});

test("SELF-NOTIFICATION: Alice reacting to her own Snap creates no notification and no push", { skip: SKIP }, async () => {
  const beforeCount = getReceiver().attempts.length;
  const unreadBefore = await assertUnreadMatchesDb(aliceSession, serverPort, "self baseline");

  const reaction = await api<{ reaction: { type: string } | null }>(
    aliceSession,
    serverPort,
    `/api/snaps/${snapId}/reaction`,
    { method: "POST", body: { type: "LOVE" } },
  );
  assert.equal(reaction.status, 200, `self reaction: ${reaction.text}`);

  // The service self-guard is fire-and-forget; give it a bounded window and
  // then prove nothing was created.
  await settle(1_500);
  const selfRows = await getDb().notification.count({
    where: { type: "REACTION", userId: alice.id, actorId: alice.id, snapId },
  });
  assert.equal(selfRows, 0, "self-actions never notify");
  assert.equal(getReceiver().attempts.length, beforeCount, "no push for self-actions");
  assert.equal(await assertUnreadMatchesDb(aliceSession, serverPort, "self after"), unreadBefore);

  // The reaction itself did persist (the action is allowed).
  const ownReaction = await getDb().reaction.findUnique({
    where: { userId_snapId: { userId: alice.id, snapId } },
    select: { type: true },
  });
  assert.equal(ownReaction?.type, "LOVE");
});

test("N1 MUTE: muted reaction keeps row + unread with 0 push attempts; re-enabled delivers to all devices", { skip: SKIP }, async () => {
  // Mute reactions through the real preferences API.
  const muted = await api<Record<string, boolean>>(aliceSession, serverPort, "/api/notifications/preferences", {
    method: "PATCH",
    body: { reaction: false },
  });
  assert.equal(muted.status, 200, `preferences patch: ${muted.text}`);
  assert.equal(muted.body?.reaction, false, "reaction muted");
  assert.equal(muted.body?.comment, true, "other categories untouched");

  // Charlie reacts (fresh actor) while muted — same emoji as Bob's so the
  // later N3 grouping step sees one same-emoji group on this snap.
  const mutedReaction = await api<unknown>(charlieSession, serverPort, `/api/snaps/${snapId}/reaction`, {
    method: "POST",
    body: { type: "LOVE" },
  });
  assert.equal(mutedReaction.status, 200, `muted reaction: ${mutedReaction.text}`);

  await waitFor(
    "muted REACTION notification row",
    async () =>
      getDb().notification.count({
        where: { type: "REACTION", userId: alice.id, actorId: charlie.id, snapId },
      }),
    1,
  );
  // N1 invariant: the row exists, unread, while push attempts stay at zero.
  const attemptsBeforeMute = pushSeen;
  assert.equal(
    getReceiver().attempts.length,
    attemptsBeforeMute,
    "muted category: 0 push attempts",
  );
  const unreadNow = await assertUnreadMatchesDb(aliceSession, serverPort, "muted reaction unread");
  assert.equal(unreadNow, 2, "muted notification still counts as unread");
  const mutedRow = await getDb().notification.findFirst({
    where: { type: "REACTION", userId: alice.id, actorId: charlie.id },
    select: { readAt: true, body: true },
  });
  assert.ok(mutedRow);
  assert.equal(mutedRow.readAt, null, "mute never marks rows read");
  assert.equal(mutedRow.body, "❤️", "LOVE reaction body");

  // Re-enable and react again with a fresh snap (toggle updates do not
  // notify by design; only create-path reactions notify).
  const unmuted = await api<Record<string, boolean>>(aliceSession, serverPort, "/api/notifications/preferences", {
    method: "PATCH",
    body: { reaction: true },
  });
  assert.equal(unmuted.status, 200, `preferences unpatch: ${unmuted.text}`);
  assert.equal(unmuted.body?.reaction, true);

  const snapY = await getDb().snap.create({
    data: {
      imageUrl: "https://example.com/n4e2e-snapy.jpg",
      publicId: `${runId}_snapy`,
      userId: alice.id,
    },
    select: { id: true },
  });

  const freshReaction = await api<unknown>(charlieSession, serverPort, `/api/snaps/${snapY.id}/reaction`, {
    method: "POST",
    body: { type: "LOVE" },
  });
  assert.equal(freshReaction.status, 200, `fresh reaction: ${freshReaction.text}`);

  await waitFor(
    "unmuted REACTION notification row",
    async () =>
      getDb().notification.count({
        where: { type: "REACTION", userId: alice.id, actorId: charlie.id, snapId: snapY.id },
      }),
    1,
  );
  await expectPushes(
    3,
    "unmuted reaction push",
    ["aliceDevA", "aliceDevB", "aliceDevC"],
  );
  assertVapidDelivery("unmuted reaction push");
  assert.equal(
    await assertUnreadMatchesDb(aliceSession, serverPort, "after unmuted reaction"),
    3,
  );
});

test("N3 GROUPING over the real list: 2 comment rows -> 1 visual group, lossless, N2 counts rows, group read", { skip: SKIP }, async () => {
  // Bob and Charlie both comment on Alice's snap (create-path notifies).
  const bobComment = await api<{ comment: { id: string } }>(
    bobSession,
    serverPort,
    `/api/snaps/${snapId}/comments`,
    { method: "POST", body: { content: `n4 comment by bob ${runId}` } },
  );
  assert.equal(bobComment.status, 201, `bob comment: ${bobComment.text}`);

  const charlieComment = await api<{ comment: { id: string } }>(
    charlieSession,
    serverPort,
    `/api/snaps/${snapId}/comments`,
    { method: "POST", body: { content: `n4 comment by charlie ${runId}` } },
  );
  assert.equal(charlieComment.status, 201, `charlie comment: ${charlieComment.text}`);

  await waitFor(
    "two COMMENT rows",
    async () =>
      getDb().notification.count({
        where: { type: "COMMENT", userId: alice.id, snapId },
      }),
    2,
  );
  await expectPushes(6, "comment pushes", [
    "aliceDevA",
    "aliceDevA",
    "aliceDevB",
    "aliceDevB",
    "aliceDevC",
    "aliceDevC",
  ]);

  // Exactly 2 underlying rows — no synthetic grouping row.
  const commentRows = await notificationRows(alice.id, { type: "COMMENT" });
  assert.equal(commentRows.length, 2, "DB keeps both individual rows");
  assert.deepEqual(
    commentRows.map((row) => row.actorId).sort(),
    [bob.id, charlie.id].sort(),
  );
  assert.deepEqual(
    commentRows.map((row) => row.body).sort(),
    [`n4 comment by bob ${runId}`, `n4 comment by charlie ${runId}`].sort(),
    "comment previews preserved",
  );

  // N2: server unread counts rows, not visual groups.
  const unread = await assertUnreadMatchesDb(aliceSession, serverPort, "before group read");
  assert.equal(unread, 5, "3 reactions + 2 comments are unread rows");

  // N3: group the REAL API payload with the real production helper.
  const { items } = await listNotifications(aliceSession, serverPort);
  const groups = groupNotifications(items);

  // Lossless: every loaded row appears exactly once.
  const flattened = groups.flatMap((group) => group.notifications.map((n) => n.id));
  assert.equal(flattened.length, items.length, "lossless: group members sum to item count");
  assert.deepEqual([...flattened].sort(), items.map((item) => item.id).sort());

  const commentGroup = groups.find(
    (group) => group.type === "COMMENT" && group.notifications[0].snapId === snapId,
  );
  assert.ok(commentGroup, "comments on the snap form one group");
  assert.equal(commentGroup.notifications.length, 2, "2 DB rows -> 1 visual group");
  assert.equal(commentGroup.actorCount, 2, "both actors represented");
  assert.equal(commentGroup.unreadCount, 2, "group unread = any member unread");

  const snapReactionGroup = groups.find(
    (group) =>
      group.type === "REACTION" &&
      group.notifications[0].snapId === snapId &&
      group.notifications[0].body === "❤️",
  );
  assert.ok(snapReactionGroup, "same-emoji reactions on the same snap group together");
  assert.equal(snapReactionGroup.notifications.length, 2, "Bob + Charlie LOVE share one group");

  // Visual groups are strictly fewer than underlying rows.
  assert.ok(groups.length < items.length, "grouping compresses the presentation");

  // Group read: per-member PATCH through the existing API (client behavior).
  await markGroupRead(
    aliceSession,
    commentGroup.notifications.map((n) => n.id),
  );
  assert.equal(
    await assertUnreadMatchesDb(aliceSession, serverPort, "after group read"),
    3,
    "badge drops by exactly the rows that became read",
  );
  const commentReadRows = await getDb().notification.findMany({
    where: { type: "COMMENT", userId: alice.id },
    select: { readAt: true },
  });
  assert.equal(commentReadRows.length, 2, "still exactly 2 rows — no synthetic row appeared");
  assert.ok(commentReadRows.every((row) => row.readAt !== null), "both rows now read");
});

test("MARK-ALL-READ: read-all clears exactly Alice's rows, never chat state, never Bob's", { skip: SKIP }, async () => {
  // Alice still holds unread rows (3 reactions); Bob holds 0 after his read.
  const aliceBefore = await assertUnreadMatchesDb(aliceSession, serverPort, "read-all baseline");
  assert.ok(aliceBefore > 0, "there is something to clear");

  const participants = await getDb().conversationParticipant.findMany({
    where: { conversationId },
    select: { lastReadAt: true },
  });
  assert.ok(participants.every((p) => p.lastReadAt === null), "chat read state untouched");

  const readAll = await api<{ updated: number }>(aliceSession, serverPort, "/api/notifications/read-all", {
    method: "POST",
  });
  assert.equal(readAll.status, 200, `read-all: ${readAll.text}`);
  assert.equal(readAll.body?.updated, aliceBefore, "updated equals the rows that were unread");
  assert.equal(await assertUnreadMatchesDb(aliceSession, serverPort, "after read-all"), 0);

  // Chat read state is still untouched (lastReadAt != readAt).
  const participantsAfter = await getDb().conversationParticipant.findMany({
    where: { conversationId },
    select: { lastReadAt: true },
  });
  assert.ok(participantsAfter.every((p) => p.lastReadAt === null), "lastReadAt untouched");

  // Owner scoping: Alice's read-all never touches rows she does not own.
  const bobOwned = await getDb().notification.count({ where: { userId: bob.id } });
  assert.equal(bobOwned, 1, "Bob's acceptance row still exists");
  const bobRead = await getDb().notification.findFirst({
    where: { userId: bob.id },
    select: { readAt: true },
  });
  assert.ok(bobRead?.readAt, "Bob's own read stands on its own");
});

test("PAGINATION: cursor pages never duplicate or lose rows and regroup losslessly", { skip: SKIP }, async () => {
  const { items, nextCursor } = await listNotifications(aliceSession, serverPort);
  // Under PAGE_SIZE rows: single page, terminal cursor.
  assert.equal(items.length, 7, "all rows on one page");
  assert.equal(nextCursor, null, "no cursor when the result set fits one page");

  // Newest-first ordering by createdAt.
  for (let index = 1; index < items.length; index += 1) {
    assert.ok(
      items[index - 1].createdAt >= items[index].createdAt,
      "list is newest-first",
    );
  }

  // Cursor semantics: fetching with a mid-list cursor skips the cursor row
  // itself and returns only what follows — no duplicates, no losses.
  const cursor = items[3].id;
  const { items: page2 } = await listNotifications(aliceSession, serverPort, cursor);
  assert.ok(page2.length > 0, "cursor page returns the remainder");
  const page2Ids = page2.map((item) => item.id);
  assert.equal(page2Ids.includes(cursor), false, "cursor row is skipped");
  assert.equal(new Set(page2Ids).size, page2Ids.length, "no duplicates across the cursor");

  const page1Ids = items.slice(0, 4).map((item) => item.id);
  const union = [...page1Ids, ...page2Ids];
  assert.equal(new Set(union).size, items.length, "pages together cover every row exactly once");
  assert.deepEqual([...union].sort(), items.map((item) => item.id).sort());

  // Groups recompute from any loaded slice without loss (N3 Option A).
  const combined = [...items.slice(0, 4), ...page2];
  const regrouped = groupNotifications(combined);
  const flattened = regrouped.flatMap((group) => group.notifications.map((n) => n.id));
  assert.equal(flattened.length, combined.length, "regroup after append stays lossless");
  assert.deepEqual([...flattened].sort(), combined.map((item) => item.id).sort());
});

test("API payload contract: list fields feed the client destination/title builders", { skip: SKIP }, async () => {
  const { items } = await listNotifications(aliceSession, serverPort);
  assert.equal(items.length, 7, "Alice's full history");

  // Every item carries exactly the fields NotificationsPageClient consumes.
  const requiredKeys = [
    "id",
    "type",
    "actor",
    "snapId",
    "snapOwnerName",
    "conversationId",
    "body",
    "read",
    "createdAt",
  ];
  for (const item of items) {
    for (const key of requiredKeys) {
      assert.ok(key in item, `item ${item.id} carries ${key}`);
    }
    assert.equal(typeof item.read, "boolean", "read is derived from readAt");
    assert.ok(typeof item.actor.name === "string", "actor name for titles/destinations");
    assert.ok(!("readAt" in item), "raw readAt is not exposed — read boolean only");
    assert.ok(!("actorId" in item), "actor identity rides actor.name only");
  }

  // Types seen across the run stay inside the locked UI union.
  const allowed = new Set([
    "NEW_SNAP",
    "NEW_MESSAGE",
    "REACTION",
    "COMMENT",
    "BIRTHDAY",
    "FOLLOW",
    "FOLLOW_ACCEPTED",
  ]);
  for (const item of items) {
    assert.ok(allowed.has(item.type), `type ${item.type} is in the locked union`);
  }

  // The N2 badge endpoint and the list agree after everything above ran.
  assert.equal(await assertUnreadMatchesDb(aliceSession, serverPort, "final"), 0);
});
