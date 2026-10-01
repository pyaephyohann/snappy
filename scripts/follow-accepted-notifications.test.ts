/**
 * Social Notifications — Follow Accepted.
 *
 * Audit finding: Snappy has NO pending follow-request state. A `UserFollow`
 * row is active immediately, and "acceptance" is the follow-back that makes
 * the pair mutual (the non-mutual -> mutual transition). This milestone
 * wires `FOLLOW_ACCEPTED` to exactly that transition:
 *
 * - A follows B (A -> B); B follows back (B -> A) -> A gets
 *   "B accepted your follow" (actor B, the accepting user)
 * - a first, non-accepting follow creates no FOLLOW_ACCEPTED
 * - a retried follow request never duplicates the notification
 * - PWA push uses the created notification record
 *
 * Run: node --env-file-if-exists=.env.local --import tsx --test scripts/follow-accepted-notifications.test.ts
 */

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { webpush } from "../lib/notifications/vapid";

const hasDb = Boolean(process.env.DATABASE_URL);
const SKIP = !hasDb ? "DATABASE_URL not set" : false;

const root = resolve(import.meta.dirname, "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const route = read("app/api/users/[userId]/follow/route.ts");
const service = read("lib/notifications/notification-service.ts");
const schema = read("prisma/schema.prisma");
const migration = read(
  "prisma/migrations/20261002130000_social_follow_accepted_notifications/migration.sql",
);
const client = read("components/notifications/NotificationsPageClient.tsx");

// ===========================================================================
// Source-level wiring (always run)
// ===========================================================================

test("acceptance is the mutual-completion transition, derived server-side", () => {
  // The service checks the reverse follow row: a pair that is already mutual
  // means the new follow accepted the other user's earlier follow.
  assert.match(
    service,
    /followerId_followingId: \{\s*followerId: follow\.followingId,\s*followingId: follow\.followerId,\s*\}/,
  );

  // Accepted events use the dedicated type and copy.
  assert.match(service, /type: "FOLLOW_ACCEPTED",/);
  assert.match(service, /`\$\{actor\.name\} accepted your follow`/);

  // Recipient stays the pre-existing follower (the follow target of the new
  // row), derived from the persisted follow — never from client input.
  assert.match(service, /userId: follow\.followingId,/);
  assert.match(service, /actorId: follow\.followerId,/);
  assert.doesNotMatch(service, /notifyFollowEvent[\s\S]{0,200}recipientId/);

  // Exactly one notification per persisted follow: both the accepted and the
  // plain path funnel through one create call, and the accepted path returns
  // before the plain follow notification would be created.
  const fnStart = service.indexOf("export async function notifyFollowEvent");
  const fnEnd = service.indexOf("export async function sendBirthdayNotificationIfDue");
  const fn = service.slice(fnStart, fnEnd);
  assert.equal((fn.match(/prisma\.notification\.create/g) ?? []).length, 1);
  const acceptedIndex = fn.indexOf('type: "FOLLOW_ACCEPTED"');
  const plainIndex = fn.indexOf('type: "FOLLOW",');
  assert.ok(acceptedIndex > 0 && plainIndex > acceptedIndex);
});

test("the follow hook still notifies once per created follow", () => {
  // Acceptance rides the same route hook: only the actual-create path
  // notifies, so a retried request (P2002) or a failed follow never reaches
  // the notification service.
  const calls = route.match(/notifyFollowEvent\(\{/g);
  assert.equal(calls?.length, 1);
  assert.match(route, /if \(created\) \{\s*void notifyFollowEvent\(\{/);
  assert.doesNotMatch(
    route.slice(route.indexOf("export async function DELETE")),
    /notifyFollowEvent/,
  );
});

test("FOLLOW_ACCEPTED is added to the notification enum additively", () => {
  assert.match(
    schema,
    /enum NotificationType \{\n  NEW_SNAP\n  NEW_MESSAGE\n  REACTION\n  COMMENT\n  BIRTHDAY\n  FOLLOW\n  FOLLOW_ACCEPTED\n\}/,
  );
  assert.match(
    migration,
    /ALTER TYPE "NotificationType" ADD VALUE 'FOLLOW_ACCEPTED';/,
  );
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/i);
});

test("FOLLOW_ACCEPTED renders in the existing client with a profile link", () => {
  assert.match(client, /"FOLLOW_ACCEPTED"/);
  assert.match(client, /`\$\{item\.actor\.name\} accepted your follow`/);
  assert.match(
    client,
    /if \(item\.type === "FOLLOW_ACCEPTED"\) \{\s*const path = `\/friends\/\$\{encodeURIComponent\(item\.actor\.name\)\}`;/,
  );
  assert.doesNotMatch(client, /lastReadAt/);
});

// ===========================================================================
// Database-backed behavior (run with DATABASE_URL)
// ===========================================================================

let prisma: PrismaClient | null = null;
const testUserIds: string[] = [];
const createdEndpoints: string[] = [];

type SendNotificationFn = (
  subscription: { endpoint: string },
  payload: string,
) => Promise<unknown>;
const sendable = webpush as unknown as { sendNotification: SendNotificationFn };
const originalSendNotification = sendable.sendNotification;
const sent: { endpoint: string; payload: Record<string, string> }[] = [];

const VAPID_ENV_KEYS = [
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
] as const;
const savedVapidEnv: Record<string, string | undefined> = {};

async function db(): Promise<PrismaClient> {
  if (!prisma) {
    const { PrismaClient: PrismaClientCtor } = await import("@prisma/client");
    prisma = new PrismaClientCtor();
  }
  return prisma;
}

async function createTestUser(namePrefix: string): Promise<{
  id: string;
  name: string;
}> {
  const client = await db();
  const name = `${namePrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const user = await client.user.create({
    data: { name, profileImage: "https://example.com/avatar.jpg" },
  });
  testUserIds.push(user.id);
  return { id: user.id, name: user.name };
}

/** Mirrors the follow route's create: "created" or "duplicate" (P2002). */
async function followAsRoute(
  followerId: string,
  followingId: string,
): Promise<"created" | "duplicate"> {
  const client = await db();
  try {
    await client.userFollow.create({ data: { followerId, followingId } });
    return "created";
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return "duplicate";
    }
    throw error;
  }
}

async function createTestSubscription(
  userId: string,
  tag: string,
): Promise<string> {
  const client = await db();
  const endpoint = `https://push.test/follow-acc/${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  createdEndpoints.push(endpoint);
  await client.pushSubscription.create({
    data: {
      endpoint,
      p256dh: "test-p256dh",
      auth: "test-auth",
      deviceId: `follow-acc-device-${tag}`,
      userId,
    },
  });
  return endpoint;
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
    sent.push({
      endpoint: subscription.endpoint,
      payload: JSON.parse(payload) as Record<string, string>,
    });
    return { statusCode: 201 };
  };

  if (!hasDb) return;
  const client = await db();
  await client.user.deleteMany({
    where: { name: { startsWith: "followacc_notif_" } },
  });
  await client.pushSubscription.deleteMany({
    where: { endpoint: { startsWith: "https://push.test/follow-acc/" } },
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
  if (testUserIds.length > 0) {
    // Cascades remove follows and notifications.
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
  }
  await prisma.$disconnect();
});

test("B following back A notifies A that B accepted the follow", { skip: SKIP }, async () => {
  const client = await db();
  const { notifyFollowEvent } = await import(
    "../lib/notifications/notification-service"
  );
  const userA = await createTestUser("followacc_notif_a");
  const userB = await createTestUser("followacc_notif_b");

  // A follows B first (plain follow: B is notified).
  assert.equal(await followAsRoute(userA.id, userB.id), "created");
  await notifyFollowEvent({ followerId: userA.id, followingId: userB.id });

  // B follows back: the pair becomes mutual — the acceptance transition.
  assert.equal(await followAsRoute(userB.id, userA.id), "created");
  await notifyFollowEvent({ followerId: userB.id, followingId: userA.id });

  const rowsForA = await client.notification.findMany({
    where: { userId: userA.id },
  });
  assert.equal(rowsForA.length, 1, "A receives exactly one acceptance");
  assert.equal(rowsForA[0].type, "FOLLOW_ACCEPTED");
  assert.equal(rowsForA[0].actorId, userB.id, "the accepting user is the actor");
  assert.equal(rowsForA[0].readAt, null);

  const rowsForB = await client.notification.findMany({
    where: { userId: userB.id },
  });
  assert.equal(rowsForB.length, 1, "B keeps only the original plain follow");
  assert.equal(rowsForB[0].type, "FOLLOW");
});

test("a non-accepting follow creates no FOLLOW_ACCEPTED", { skip: SKIP }, async () => {
  const client = await db();
  const { notifyFollowEvent } = await import(
    "../lib/notifications/notification-service"
  );
  const userA = await createTestUser("followacc_notif_na");
  const userB = await createTestUser("followacc_notif_nb");

  // First follow of a fresh pair: not an acceptance.
  assert.equal(await followAsRoute(userB.id, userA.id), "created");
  await notifyFollowEvent({ followerId: userB.id, followingId: userA.id });

  const accepted = await client.notification.findMany({
    where: { userId: userA.id, type: "FOLLOW_ACCEPTED" },
  });
  assert.equal(accepted.length, 0, "no acceptance for a one-sided follow");

  const plain = await client.notification.findMany({
    where: { userId: userA.id, type: "FOLLOW" },
  });
  assert.equal(plain.length, 1, "the plain follow notification is unchanged");
});

test("a retried acceptance request does not duplicate the notification", {
  skip: SKIP,
}, async () => {
  const client = await db();
  const { notifyFollowEvent } = await import(
    "../lib/notifications/notification-service"
  );
  const userA = await createTestUser("followacc_notif_ra");
  const userB = await createTestUser("followacc_notif_rb");

  assert.equal(await followAsRoute(userA.id, userB.id), "created");
  assert.equal(await followAsRoute(userB.id, userA.id), "created");
  await notifyFollowEvent({ followerId: userB.id, followingId: userA.id });

  // The retried request hits the unique pair and the route never notifies.
  assert.equal(await followAsRoute(userB.id, userA.id), "duplicate");

  const rows = await client.notification.findMany({
    where: { userId: userA.id },
  });
  assert.equal(rows.length, 1, "one acceptance notification after a retry");
  assert.equal(rows[0].type, "FOLLOW_ACCEPTED");
});

test("acceptance Web Push uses the created notification record", { skip: SKIP }, async () => {
  const client = await db();
  const { notifyFollowEvent } = await import(
    "../lib/notifications/notification-service"
  );
  sent.length = 0;

  const userA = await createTestUser("followacc_notif_pa");
  const userB = await createTestUser("followacc_notif_pb");
  const aEndpoint = await createTestSubscription(userA.id, "a");
  await createTestSubscription(userB.id, "b");

  await followAsRoute(userA.id, userB.id);
  await followAsRoute(userB.id, userA.id);
  await notifyFollowEvent({ followerId: userB.id, followingId: userA.id });

  const rows = await client.notification.findMany({
    where: { userId: userA.id, type: "FOLLOW_ACCEPTED" },
  });
  assert.equal(rows.length, 1);

  assert.equal(sent.length, 1, "only the original follower's device receives");
  assert.equal(sent[0].endpoint, aEndpoint);
  assert.equal(sent[0].payload.type, "FOLLOW_ACCEPTED");
  assert.equal(sent[0].payload.title, `${userB.name} accepted your follow`);
  assert.equal(sent[0].payload.url, `/friends/${userB.name}`);
  assert.equal(sent[0].payload.notificationId, rows[0].id);
});
