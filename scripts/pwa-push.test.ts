/**
 * PWA Web Push notifications.
 *
 * Audit finding: the implementation already exists end-to-end —
 * - service worker: public/sw.js registers `push` + `notificationclick`,
 *   sanitizes payload URLs, tags notifications by notificationId;
 * - storage: PushSubscription (endpoint @unique, userId, migrations
 *   20260917120000 / 20260917140000 / 20260918121542);
 * - API: POST/DELETE /api/notifications/subscribe (auth, zod, upsert by
 *   endpoint, cross-user 403, owner-scoped delete);
 * - VAPID: GET /api/notifications/vapid-public-key (public key only, 503
 *   when unconfigured); private key stays server-side;
 * - client: lib/push-client.ts + NotificationSettings (permission requested
 *   only from the explicit Enable button);
 * - delivery: notifySnapInteraction pushes only after the Notification row
 *   is created, only to the Snap owner's subscriptions, and removes
 *   subscriptions on 404/410 while keeping them on transient errors.
 *
 * This suite locks that contract per the milestone's test matrix.
 *
 * Run: node --env-file-if-exists=.env.local --import tsx --test scripts/pwa-push.test.ts
 */

import "./test-db-guard";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import type { PrismaClient } from "@prisma/client";
import { webpush } from "../lib/notifications/vapid";

const hasDb = Boolean(process.env.DATABASE_URL);
const SKIP = !hasDb ? "DATABASE_URL not set" : false;

const root = resolve(import.meta.dirname, "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const subscribeRoute = read("app/api/notifications/subscribe/route.ts");
const vapidRoute = read("app/api/notifications/vapid-public-key/route.ts");
const pushSubscriptionSchema = read("lib/notifications/push-subscription-schema.ts");
const service = read("lib/notifications/notification-service.ts");
const pushClient = read("lib/push-client.ts");
const settings = read("components/notifications/NotificationSettings.tsx");
const reactionRoute = read("app/api/snaps/[snapId]/reaction/route.ts");
const commentsRoute = read("app/api/snaps/[snapId]/comments/route.ts");
const prismaSchema = read("prisma/schema.prisma");

// ===========================================================================
// Source-level contract (always run)
// ===========================================================================

test("subscribe endpoint authenticates, validates, and upserts by endpoint", () => {
  // Auth: unauthenticated requests never reach the database.
  assert.match(subscribeRoute, /getAuthenticatedAppUser/);
  assert.equal(
    (subscribeRoute.match(/status: 401/g) ?? []).length,
    2,
    "both POST and DELETE reject unauthenticated callers",
  );

  // Validation: malformed payloads are rejected before any write.
  // Both handlers guard invalid JSON (400) and invalid schema payloads (400).
  assert.match(subscribeRoute, /pushSubscriptionSchema\.safeParse\(body\)/);
  assert.equal(
    (subscribeRoute.match(/status: 400/g) ?? []).length,
    4,
    "both handlers reject malformed bodies",
  );

  // Duplicate endpoints upsert instead of inserting a second row.
  assert.match(subscribeRoute, /prisma\.pushSubscription\.upsert\(\{\s*where: \{ endpoint \},/);
  assert.match(prismaSchema, /endpoint\s+String\s+@unique/);

  // The client can never choose the subscription owner.
  assert.match(subscribeRoute, /userId: user\.id/);
  assert.doesNotMatch(subscribeRoute, /body\.userId|parsed\.data\.userId/);
  assert.doesNotMatch(pushSubscriptionSchema, /userId/);

  // A subscription already owned by someone else is refused.
  assert.match(subscribeRoute, /existing\?\.userId && existing\.userId !== user\.id/);
  assert.match(subscribeRoute, /Subscription belongs to another user/);
  assert.match(subscribeRoute, /status: 403/);
});

test("unsubscribe only deletes the caller's own subscription rows", () => {
  const deleteStart = subscribeRoute.indexOf("export async function DELETE");
  assert.ok(deleteStart > 0, "DELETE handler exists");
  const deleteHandler = subscribeRoute.slice(deleteStart);
  assert.match(deleteHandler, /getAuthenticatedAppUser/);
  assert.match(deleteHandler, /status: 401/);
  assert.match(deleteHandler, /prisma\.pushSubscription\.deleteMany\(\{\s*where: \{ endpoint: parsed\.data\.endpoint, userId: user\.id \},/);
  assert.doesNotMatch(deleteHandler, /delete\(\{ where: \{ endpoint \}\}/);
});

test("subscription schema accepts a valid browser payload and rejects bad or hostile input", async () => {
  const { pushSubscriptionSchema: schema, unsubscribeSchema } = await import(
    "../lib/notifications/push-subscription-schema"
  );

  const valid = {
    deviceId: "3f1d2a4c-9b7e-4f0a-8c3d-1e2f3a4b5c6d",
    endpoint: "https://push.example.com/abc123",
    keys: { p256dh: "BNxTestKey", auth: "authToken" },
  };

  const parsed = schema.safeParse(valid);
  assert.equal(parsed.success, true);
  assert.ok(parsed.success);
  // A client-supplied userId is silently dropped — never trusted.
  assert.equal("userId" in parsed.data, false);

  assert.equal(schema.safeParse({ ...valid, deviceId: "not-a-uuid" }).success, false);
  assert.equal(schema.safeParse({ ...valid, endpoint: "not-a-url" }).success, false);
  assert.equal(
    schema.safeParse({ ...valid, keys: { p256dh: "", auth: "a" } }).success,
    false,
    "empty p256dh rejected",
  );
  assert.equal(
    schema.safeParse({ ...valid, keys: { p256dh: "k", auth: "" } }).success,
    false,
    "empty auth rejected",
  );
  assert.equal(unsubscribeSchema.safeParse({ endpoint: "https://push.example.com/abc123" }).success, true);
  assert.equal(unsubscribeSchema.safeParse({ endpoint: "nope" }).success, false);
});

test("VAPID key handling exposes the public key only", async () => {
  const saved = process.env.VAPID_PUBLIC_KEY;
  try {
    const { getVapidPublicKey } = await import("../lib/notifications/vapid");

    process.env.VAPID_PUBLIC_KEY = "test-public-key";
    assert.equal(getVapidPublicKey(), "test-public-key");

    delete process.env.VAPID_PUBLIC_KEY;
    assert.equal(getVapidPublicKey(), null, "unconfigured server reports no key");

    // The route module never reads or returns the private key.
    assert.doesNotMatch(vapidRoute, /VAPID_PRIVATE|privateKey/i);
    assert.match(vapidRoute, /getVapidPublicKey/);
    assert.match(vapidRoute, /status: 503/);
  } finally {
    if (saved === undefined) {
      delete process.env.VAPID_PUBLIC_KEY;
    } else {
      process.env.VAPID_PUBLIC_KEY = saved;
    }
  }

  // Nothing client-facing can reach the private key.
  for (const source of [pushClient, settings, vapidRoute]) {
    assert.doesNotMatch(source, /VAPID_PRIVATE/);
  }
});

test("push fires only after the Notification row exists, targeted at the Snap owner", () => {
  const fnStart = service.indexOf("export async function notifySnapInteraction");
  const fnEnd = service.indexOf("export async function createNewMessageNotification");
  assert.ok(fnStart > 0 && fnEnd > fnStart, "notifySnapInteraction is defined");
  const fn = service.slice(fnStart, fnEnd);

  const guardIdx = fn.indexOf("if (snap.userId === actorId)");
  const createIdx = fn.indexOf("prisma.notification.create");
  const pushIdx = fn.indexOf("prisma.pushSubscription.findMany");
  assert.ok(guardIdx >= 0 && guardIdx < createIdx, "self-notification guard runs before create");
  assert.ok(createIdx < pushIdx, "the persisted notification precedes any push attempt");

  // Push targets only the owner's rows and carries the record's id for deep-linking.
  assert.match(fn, /where: \{ userId: snap\.userId \}/);
  assert.match(fn, /notificationId: notification\.id/);
  assert.match(fn, /if \(!isWebPushConfigured\(\)\) \{/);
  assert.match(fn, /const targetPath = `\/notifications`;/);
  assert.match(fn, /sanitizeNotificationUrl\(targetPath\)/);
  // One delivery loop per created notification — no second push path.
  assert.equal(
    (fn.match(/sendPushToSubscription\(subscription, payload, index\)/g) ?? []).length,
    1,
  );
});

test("routes never talk to web-push directly — the service is the single delivery path", () => {
  for (const route of [reactionRoute, commentsRoute]) {
    assert.match(route, /void notifySnapInteraction/);
    assert.doesNotMatch(route, /web-push|webpush|sendNotification|pushSubscription/i);
  }
});

test("subscription removal on permanent failure is confined to 404/410", () => {
  const sendStart = service.indexOf("async function sendPushToSubscription");
  const sendEnd = service.indexOf("/** Broadcasts a new Snap push");
  assert.ok(sendStart > 0 && sendEnd > sendStart, "sendPushToSubscription is defined");
  const sendFn = service.slice(sendStart, sendEnd);

  assert.match(sendFn, /statusCode === 404 \|\| statusCode === 410/);
  assert.match(sendFn, /prisma\.pushSubscription\s*\n\s*\.delete\(\{/);
  // The only subscription delete in the service sits inside that guard.
  assert.equal(
    (service.match(/prisma\.pushSubscription\s*\n\s*\.delete\(\{/g) ?? []).length,
    1,
  );
  assert.match(sendFn, /return false/, "a failed delivery never throws into the caller");
});

test("notification permission is requested only from the explicit Enable action", () => {
  // Exactly one prompt in the whole client, inside subscribeToWebPush.
  assert.equal(
    (pushClient.match(/Notification\.requestPermission\(\)/g) ?? []).length,
    1,
  );
  const subscribeStart = pushClient.indexOf("export async function subscribeToWebPush");
  const unsubscribeStart = pushClient.indexOf("export async function unsubscribeFromWebPush");
  const subscribeFn = pushClient.slice(subscribeStart, unsubscribeStart);
  assert.match(subscribeFn, /Notification\.requestPermission\(\)/);

  // The settings component never prompts directly.
  assert.doesNotMatch(settings, /requestPermission/);

  // Mount effect only re-syncs an existing granted subscription — no auto-subscribe.
  const effectStart = settings.indexOf("useEffect(() => {");
  const handleEnableStart = settings.indexOf("const handleEnable");
  assert.ok(effectStart >= 0 && handleEnableStart > effectStart);
  const effect = settings.slice(effectStart, handleEnableStart);
  assert.doesNotMatch(effect, /subscribeToWebPush|requestPermission/);
  assert.match(effect, /syncExistingPushSubscriptionToServer/);

  // The button wires the prompt.
  const enableFn = settings.slice(handleEnableStart, settings.indexOf("const handleDisable"));
  assert.match(enableFn, /await subscribeToWebPush\(\)/);
  assert.match(settings, /onClick=\{\(\) => void handleEnable\(\)\}/);
  assert.match(settings, /Notifications are blocked in your browser settings\./);
});

// ===========================================================================
// Service worker contract — executed in a sandbox (always run)
// ===========================================================================

interface RecordedNotification {
  title: string;
  options: {
    body?: string;
    tag?: string;
    icon?: string;
    data?: { url?: string; notificationId?: string; type?: string };
  };
}

interface SwHarness {
  listeners: Record<string, (event: unknown) => void>;
  shown: RecordedNotification[];
  messages: Array<Record<string, unknown>>;
  opened: string[];
  navigations: string[];
  focusCount: () => number;
  origin: string;
}

function loadServiceWorker(withClient: boolean): SwHarness {
  const listeners: Record<string, (event: unknown) => void> = {};
  const shown: RecordedNotification[] = [];
  const messages: Array<Record<string, unknown>> = [];
  const opened: string[] = [];
  const navigations: string[] = [];
  let focuses = 0;
  const origin = "https://snappy.test";

  const client = {
    url: `${origin}/home`,
    postMessage(message: Record<string, unknown>) {
      messages.push(message);
    },
    navigate: async (url: string) => {
      navigations.push(url);
    },
    focus: async () => {
      focuses += 1;
    },
  };

  const self = {
    addEventListener(type: string, fn: (event: unknown) => void) {
      listeners[type] = fn;
    },
    location: { origin },
    registration: {
      showNotification: async (title: string, options: RecordedNotification["options"]) => {
        shown.push({ title, options });
      },
    },
    clients: {
      matchAll: async () => (withClient ? [client] : []),
      openWindow: async (url: string) => {
        opened.push(url);
      },
    },
    skipWaiting: async () => undefined,
    claim: async () => undefined,
  };

  const sandbox: Record<string, unknown> = { self, URL, console };
  vm.createContext(sandbox);
  vm.runInContext(read("public/sw.js"), sandbox, { filename: "sw.js" });

  return {
    listeners,
    shown,
    messages,
    opened,
    navigations,
    focusCount: () => focuses,
    origin,
  };
}

async function dispatch(h: SwHarness, type: string, event: Record<string, unknown>): Promise<void> {
  const listener = h.listeners[type];
  assert.ok(listener, `service worker registers a "${type}" listener`);
  const waits: Promise<unknown>[] = [];
  const tracked = {
    ...event,
    waitUntil: (p: Promise<unknown>) => {
      waits.push(p);
    },
  };
  listener(tracked);
  await Promise.all(waits);
}

test("service worker registers push and notificationclick handlers", () => {
  const h = loadServiceWorker(true);
  assert.ok(h.listeners.push, "push listener registered");
  assert.ok(h.listeners.notificationclick, "notificationclick listener registered");
});

test("malformed push payload falls back to raw text without crashing", async () => {
  const h = loadServiceWorker(true);
  await dispatch(h, "push", {
    data: {
      json: () => {
        throw new Error("not json");
      },
      text: () => "plain text body",
    },
  });
  assert.equal(h.shown.length, 1, "a notification is still displayed");
  assert.equal(h.shown[0].title, "Snappy", "default title");
  assert.equal(h.shown[0].options.body, "plain text body");
  assert.match(h.shown[0].options.tag ?? "", /^snappy-/, "synthetic stable tag");
  assert.ok(h.shown[0].options.icon, "icon provided");
  assert.equal(h.messages[0]?.type, "SNAPPY_PUSH_RECEIVED", "in-app ingestion message posted");
});

test("push with no payload shows nothing and does not crash", async () => {
  const h = loadServiceWorker(true);
  await dispatch(h, "push", {});
  assert.equal(h.shown.length, 0);
  assert.equal(h.messages.length, 0);
});

test("valid push payload is displayed with its id, route, and sanitized url", async () => {
  const h = loadServiceWorker(true);
  await dispatch(h, "push", {
    data: {
      json: () => ({
        title: "Ada reacted to your Snap",
        body: "\u2764\ufe0f",
        url: "/friends/ada",
        notificationId: "notif-123",
        type: "REACTION",
        createdAt: "2026-10-01T00:00:00.000Z",
      }),
    },
  });
  assert.equal(h.shown.length, 1);
  assert.equal(h.shown[0].title, "Ada reacted to your Snap");
  assert.equal(h.shown[0].options.tag, "notif-123", "tag = notificationId dedupes banners");
  assert.equal(h.shown[0].options.data?.url, "/friends/ada");
  assert.equal(h.shown[0].options.data?.type, "REACTION");
  const posted = h.messages[0];
  assert.equal(posted?.type, "SNAPPY_PUSH_RECEIVED");
  assert.equal(
    (posted?.notification as { notificationId?: string } | undefined)?.notificationId,
    "notif-123",
  );
});

test("external or protocol-relative urls in a payload are forced back to /notifications", async () => {
  for (const hostile of ["https://evil.com/phish", "//evil.com/phish", "javascript:alert(1)"]) {
    const h = loadServiceWorker(true);
    await dispatch(h, "push", {
      data: {
        json: () => ({
          title: "Snappy",
          body: "b",
          url: hostile,
          notificationId: "n-1",
          type: "REACTION",
          createdAt: "2026-10-01T00:00:00.000Z",
        }),
      },
    });
    assert.equal(h.shown[0].options.data?.url, "/notifications", `sanitized: ${hostile}`);
  }
});

test("notificationclick focuses and navigates the existing Snappy window", async () => {
  const h = loadServiceWorker(true);
  let closed = false;
  await dispatch(h, "notificationclick", {
    notification: {
      close: () => {
        closed = true;
      },
      data: { notificationId: "n-9", url: "/friends/ada", type: "REACTION" },
    },
  });
  assert.equal(closed, true, "banner is dismissed");
  assert.deepEqual(h.navigations, [`${h.origin}/friends/ada`]);
  assert.equal(h.focusCount(), 1);
  assert.equal(h.opened.length, 0, "no duplicate window");
  const click = h.messages.find((m) => m.type === "SNAPPY_NOTIFICATION_CLICK");
  assert.equal(click?.notificationId, "n-9");
});

test("notificationclick with a hostile url lands on /notifications instead", async () => {
  const h = loadServiceWorker(true);
  await dispatch(h, "notificationclick", {
    notification: {
      close: () => undefined,
      data: { notificationId: "n-10", url: "https://evil.com/phish" },
    },
  });
  assert.deepEqual(h.navigations, [`${h.origin}/notifications`]);
});

test("notificationclick opens a new window only when none exists", async () => {
  const h = loadServiceWorker(false);
  await dispatch(h, "notificationclick", {
    notification: {
      close: () => undefined,
      data: { notificationId: "n-11", url: "/notifications" },
    },
  });
  assert.equal(h.navigations.length, 0);
  assert.deepEqual(h.opened, [`${h.origin}/notifications`]);
});

// ===========================================================================
// Delivery behavior — database-backed with web-push mocked (run with DATABASE_URL)
// ===========================================================================

let prisma: PrismaClient | null = null;
const createdUserIds: string[] = [];
const createdEndpoints: string[] = [];

interface RecordedPush {
  endpoint: string;
  payload: {
    title: string;
    body: string;
    url: string;
    notificationId: string;
    type: string;
    createdAt: string;
  };
}

type SendMode = "success" | "http-gone" | "network-error";
let sendMode: SendMode = "success";
const attempted: string[] = [];
const sent: RecordedPush[] = [];

type SendNotificationFn = (
  subscription: { endpoint: string },
  payload: string,
) => Promise<unknown>;
const sendable = webpush as unknown as { sendNotification: SendNotificationFn };
const originalSendNotification = sendable.sendNotification;

const VAPID_ENV_KEYS = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] as const;
const savedVapidEnv: Record<string, string | undefined> = {};

async function db(): Promise<PrismaClient> {
  if (!prisma) {
    const { PrismaClient: PrismaClientCtor } = await import("@prisma/client");
    prisma = new PrismaClientCtor();
  }
  return prisma;
}

async function createTestUser(namePrefix: string): Promise<{ id: string; name: string }> {
  const client = await db();
  const name = `${namePrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const user = await client.user.create({
    data: { name, profileImage: "https://example.com/avatar.jpg" },
  });
  createdUserIds.push(user.id);
  return { id: user.id, name: user.name };
}

async function createTestSnap(ownerId: string): Promise<string> {
  const client = await db();
  const snap = await client.snap.create({
    data: {
      imageUrl: "https://example.com/snap.jpg",
      publicId: `pwa-push-${ownerId}`,
      userId: ownerId,
    },
  });
  return snap.id;
}

async function createTestSubscription(userId: string, tag: string): Promise<string> {
  const client = await db();
  const endpoint = `https://push.test/pwa-push/${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  createdEndpoints.push(endpoint);
  await client.pushSubscription.create({
    data: {
      endpoint,
      p256dh: "test-p256dh",
      auth: "test-auth",
      deviceId: `pwa-push-device-${tag}`,
      userId,
    },
  });
  return endpoint;
}

function resetDeliveryCapture(): void {
  sendMode = "success";
  attempted.length = 0;
  sent.length = 0;
}

before(async () => {
  for (const key of VAPID_ENV_KEYS) {
    savedVapidEnv[key] = process.env[key];
  }
  const keys = webpush.generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VAPID_PRIVATE_KEY = keys.privateKey;
  process.env.VAPID_SUBJECT = "mailto:test@example.com";

  sendable.sendNotification = async (subscription, payload) => {
    attempted.push(subscription.endpoint);
    if (sendMode === "http-gone") {
      throw Object.assign(new Error("subscription gone"), { statusCode: 410 });
    }
    if (sendMode === "network-error") {
      throw new Error("socket hang up");
    }
    sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) });
    return { statusCode: 201 };
  };

  if (!hasDb) return;
  const client = await db();
  await client.user.deleteMany({ where: { name: { startsWith: "pwa_push_" } } });
  await client.pushSubscription.deleteMany({
    where: { endpoint: { startsWith: "https://push.test/pwa-push/" } },
  });
});

after(async () => {
  sendable.sendNotification = originalSendNotification;
  for (const key of VAPID_ENV_KEYS) {
    const value = savedVapidEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  if (!prisma) return;
  if (createdEndpoints.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: { in: createdEndpoints } },
    });
  }
  if (createdUserIds.length > 0) {
    // Cascades remove snaps, reactions, and notifications.
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

test("a like pushes to the owner's subscriptions only, with the record as canonical payload", {
  skip: SKIP,
}, async () => {
  const client = await db();
  const { notifySnapInteraction } = await import(
    "../lib/notifications/notification-service"
  );
  resetDeliveryCapture();

  const owner = await createTestUser("pwa_push_owner");
  const actor = await createTestUser("pwa_push_actor");
  const snapId = await createTestSnap(owner.id);
  const ownerEndpoint = await createTestSubscription(owner.id, "owner");
  await createTestSubscription(actor.id, "actor");

  await client.reaction.create({ data: { type: "LIKE", userId: actor.id, snapId } });
  await notifySnapInteraction({
    snapId,
    actorId: actor.id,
    type: "REACTION",
    body: "\u2764\ufe0f",
  });

  const rows = await client.notification.findMany({ where: { userId: owner.id, snapId } });
  assert.equal(rows.length, 1, "one in-app notification remains the source of truth");

  assert.equal(attempted.length, 1, "exactly one delivery attempt");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].endpoint, ownerEndpoint, "only the owner's subscription receives");
  assert.equal(sent[0].payload.type, "REACTION");
  assert.equal(sent[0].payload.url, "/notifications");
  assert.equal(sent[0].payload.notificationId, rows[0].id);
  assert.equal(sent[0].payload.title, `${actor.name} reacted to your Snap`);
  assert.equal(sent[0].payload.body, "\u2764\ufe0f");
  assert.ok(sent[0].payload.createdAt);
});

test("a comment pushes the comment preview to the Snap owner", { skip: SKIP }, async () => {
  const client = await db();
  const { notifySnapInteraction } = await import(
    "../lib/notifications/notification-service"
  );
  resetDeliveryCapture();

  const owner = await createTestUser("pwa_push_cowner");
  const actor = await createTestUser("pwa_push_cactor");
  const snapId = await createTestSnap(owner.id);
  const ownerEndpoint = await createTestSubscription(owner.id, "cowner");

  await client.comment.create({
    data: { content: "Nice shot!", userId: actor.id, snapId },
  });
  await notifySnapInteraction({
    snapId,
    actorId: actor.id,
    type: "COMMENT",
    body: "Nice shot!",
  });

  const rows = await client.notification.findMany({
    where: { userId: owner.id, snapId, type: "COMMENT" },
  });
  assert.equal(rows.length, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].endpoint, ownerEndpoint);
  assert.equal(sent[0].payload.type, "COMMENT");
  assert.equal(sent[0].payload.body, "Nice shot!");
  assert.equal(sent[0].payload.title, `${actor.name} commented on your Snap`);
  assert.equal(sent[0].payload.notificationId, rows[0].id);
});

test("no subscription means the notification is still created and no push is attempted", {
  skip: SKIP,
}, async () => {
  const client = await db();
  const { notifySnapInteraction } = await import(
    "../lib/notifications/notification-service"
  );
  resetDeliveryCapture();

  const owner = await createTestUser("pwa_push_nosub");
  const actor = await createTestUser("pwa_push_nosubactor");
  const snapId = await createTestSnap(owner.id);

  await client.reaction.create({ data: { type: "LIKE", userId: actor.id, snapId } });
  await notifySnapInteraction({ snapId, actorId: actor.id, type: "REACTION" });

  const rows = await client.notification.findMany({ where: { userId: owner.id, snapId } });
  assert.equal(rows.length, 1, "in-app notification does not depend on push");
  assert.equal(attempted.length, 0, "no delivery attempt without a subscription");
  assert.equal(sent.length, 0);
});

test("acting on your own Snap neither notifies nor pushes", { skip: SKIP }, async () => {
  const client = await db();
  const { notifySnapInteraction } = await import(
    "../lib/notifications/notification-service"
  );
  resetDeliveryCapture();

  const owner = await createTestUser("pwa_push_self");
  const snapId = await createTestSnap(owner.id);
  await createTestSubscription(owner.id, "self");

  await client.reaction.create({ data: { type: "LIKE", userId: owner.id, snapId } });
  await notifySnapInteraction({ snapId, actorId: owner.id, type: "REACTION" });

  const rows = await client.notification.findMany({ where: { userId: owner.id, snapId } });
  assert.equal(rows.length, 0, "self-notification guard intact");
  assert.equal(attempted.length, 0, "no push for a suppressed notification");
});

test("an unconfigured VAPID server degrades to in-app only", { skip: SKIP }, async () => {
  const client = await db();
  const { notifySnapInteraction } = await import(
    "../lib/notifications/notification-service"
  );
  resetDeliveryCapture();

  const owner = await createTestUser("pwa_push_novapid");
  const actor = await createTestUser("pwa_push_novapidactor");
  const snapId = await createTestSnap(owner.id);
  await createTestSubscription(owner.id, "novapid");

  const saved: Record<string, string | undefined> = {};
  for (const key of VAPID_ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  try {
    await client.reaction.create({ data: { type: "LIKE", userId: actor.id, snapId } });
    await notifySnapInteraction({ snapId, actorId: actor.id, type: "REACTION" });
  } finally {
    for (const key of VAPID_ENV_KEYS) {
      const value = saved[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  const rows = await client.notification.findMany({ where: { userId: owner.id, snapId } });
  assert.equal(rows.length, 1, "notification created regardless of push config");
  assert.equal(attempted.length, 0, "no push attempt while VAPID is absent");
});

test("a permanently invalid subscription (410) is removed after the attempt", {
  skip: SKIP,
}, async () => {
  const client = await db();
  const { notifySnapInteraction } = await import(
    "../lib/notifications/notification-service"
  );
  resetDeliveryCapture();

  const owner = await createTestUser("pwa_push_gone");
  const actor = await createTestUser("pwa_push_goneactor");
  const snapId = await createTestSnap(owner.id);
  const endpoint = await createTestSubscription(owner.id, "gone");

  sendMode = "http-gone";
  await client.reaction.create({ data: { type: "LIKE", userId: actor.id, snapId } });
  await notifySnapInteraction({ snapId, actorId: actor.id, type: "REACTION" });

  assert.equal(attempted.length, 1, "the delivery was attempted first");
  const row = await client.pushSubscription.findUnique({ where: { endpoint } });
  assert.equal(row, null, "410 removes the dead subscription");
  const rows = await client.notification.findMany({ where: { userId: owner.id, snapId } });
  assert.equal(rows.length, 1, "a push failure never removes the notification");
});

test("a transient delivery failure keeps the subscription row", { skip: SKIP }, async () => {
  const client = await db();
  const { notifySnapInteraction } = await import(
    "../lib/notifications/notification-service"
  );
  resetDeliveryCapture();

  const owner = await createTestUser("pwa_push_flaky");
  const actor = await createTestUser("pwa_push_flakyactor");
  const snapId = await createTestSnap(owner.id);
  const endpoint = await createTestSubscription(owner.id, "flaky");

  sendMode = "network-error";
  await client.reaction.create({ data: { type: "LIKE", userId: actor.id, snapId } });
  await notifySnapInteraction({ snapId, actorId: actor.id, type: "REACTION" });

  assert.equal(attempted.length, 1);
  const row = await client.pushSubscription.findUnique({ where: { endpoint } });
  assert.ok(row, "temporary errors must not delete the subscription");
  const rows = await client.notification.findMany({ where: { userId: owner.id, snapId } });
  assert.equal(rows.length, 1, "delivery failure is non-fatal for the notification");
});

test("re-subscribing the same endpoint upserts one row instead of duplicating", {
  skip: SKIP,
}, async () => {
  const client = await db();
  const owner = await createTestUser("pwa_push_upsert");
  const endpoint = `https://push.test/pwa-push/upsert-${Date.now()}`;
  createdEndpoints.push(endpoint);

  // Mirrors the route's POST body twice for the same browser subscription.
  const base = { endpoint, p256dh: "first-key", auth: "first-auth", userId: owner.id };
  await client.pushSubscription.upsert({
    where: { endpoint },
    create: { ...base, deviceId: "device-v1" },
    update: { ...base, deviceId: "device-v1" },
  });
  await client.pushSubscription.upsert({
    where: { endpoint },
    create: { ...base, p256dh: "second-key", deviceId: "device-v2" },
    update: { p256dh: "second-key", auth: "second-auth", deviceId: "device-v2" },
  });

  const rows = await client.pushSubscription.findMany({ where: { endpoint } });
  assert.equal(rows.length, 1, "endpoint uniqueness collapses duplicates");
  assert.equal(rows[0].deviceId, "device-v2");
  assert.equal(rows[0].p256dh, "second-key");
  assert.equal(rows[0].userId, owner.id);
});
