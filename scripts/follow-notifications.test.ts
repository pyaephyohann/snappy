/**
 * Social Notifications — Follow.
 *
 * Audit finding: follows are immediately-active `UserFollow` rows created by
 * `POST /api/users/[userId]/follow` (unique `(followerId, followingId)`, P2002
 * treated as an idempotent retry). This milestone adds a `FOLLOW` notification
 * on the existing Notification + Web Push architecture:
 *
 * - B follows A -> A gets "B followed you"
 * - self-follow never notifies
 * - a retried/failed follow never duplicates or creates a notification
 * - actor and recipient are derived from the persisted follow row
 * - Web Push uses the created notification record as canonical payload
 *
 * Run: node --env-file-if-exists=.env.local --import tsx --test scripts/follow-notifications.test.ts
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
  "prisma/migrations/20261002120000_social_follow_notifications/migration.sql",
);
const client = read("components/notifications/NotificationsPageClient.tsx");

// ===========================================================================
// Source-level wiring (always run)
// ===========================================================================

test("follow route notifies only after a successfully created follow", () => {
  // Exactly one notify call in the whole route.
  const calls = route.match(/notifyFollowEvent\(\{/g);
  assert.equal(calls?.length, 1);

  // The notify sits strictly after prisma.userFollow.create.
  const createIndex = route.indexOf("prisma.userFollow.create");
  const notifyIndex = route.indexOf("notifyFollowEvent({");
  assert.ok(createIndex > 0 && notifyIndex > createIndex);
  assert.doesNotMatch(
    route.slice(route.indexOf("export async function POST"), createIndex),
    /notifyFollowEvent/,
  );

  // Only the actual-create path notifies: a duplicate (P2002) sets no
  // `created` flag and a failure returns 500 before the notify block.
  assert.match(route, /let created = false;/);
  assert.match(route, /created = true;/);
  assert.match(route, /if \(created\) \{\s*void notifyFollowEvent\(\{/);

  // Fire-and-forget: a notification failure never breaks the follow response.
  assert.match(route, /void notifyFollowEvent/);
  assert.match(route, /\.catch\(\(notifyError\) =>/);

  // No client-controlled notification recipient anywhere in the route.
  assert.doesNotMatch(route, /recipientId|notifyUserId|body\.userId/i);

  // Unfollow never notifies.
  const deleteStart = route.indexOf("export async function DELETE");
  assert.doesNotMatch(route.slice(deleteStart), /notifyFollowEvent/);
});

test("the service derives actor and recipient from the persisted follow row", () => {
  // Inputs: the follow pair only — no client-supplied recipient identity.
  assert.match(
    service,
    /export async function notifyFollowEvent\(\{\s*followerId,\s*followingId,\s*\}: \{/,
  );
  assert.match(service, /followerId: string;/);
  assert.match(service, /followingId: string;/);
  assert.doesNotMatch(service, /notifyFollowEvent[\s\S]{0,200}recipientId/);

  // The persisted UserFollow row is the source of truth.
  assert.match(service, /prisma\.userFollow\.findUnique\(\{/);
  assert.match(service, /followerId_followingId: \{ followerId, followingId \}/);
  assert.match(service, /userId: follow\.followingId,/);
  assert.match(service, /actorId: follow\.followerId,/);
  assert.match(service, /type: "FOLLOW",/);

  // Self-follow never notifies, and a missing row (failed operation) is a no-op.
  assert.match(service, /if \(followerId === followingId\) \{\s*return;\s*\}/);
  assert.match(service, /if \(!follow\) \{/);

  // Copy uses the actor display name from the database.
  assert.match(service, /`\$\{actor\.name\} followed you`/);

  // Push targets only the recipient's subscriptions and reuses the created row.
  assert.match(service, /where: \{ userId: follow\.followingId \}/);
  assert.match(service, /notificationId: notification\.id,/);
  assert.match(service, /sanitizeNotificationUrl\(\s*`\/friends\/\$\{encodeURIComponent\(actor\.name\)\}`,/);
});

test("FOLLOW is added to the notification enum additively", () => {
  assert.match(
    schema,
    /enum NotificationType \{\n  NEW_SNAP\n  NEW_MESSAGE\n  REACTION\n  COMMENT\n  BIRTHDAY\n  FOLLOW\n\}/,
  );
  assert.match(migration, /ALTER TYPE "NotificationType" ADD VALUE 'FOLLOW';/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/i);
});

test("FOLLOW renders in the existing notification client with a profile link", () => {
  // Same generic list — no new notification screen.
  assert.match(
    client,
    /type: "NEW_SNAP" \| "NEW_MESSAGE" \| "REACTION" \| "COMMENT" \| "BIRTHDAY" \| "FOLLOW"/,
  );
  assert.match(client, /`\$\{item\.actor\.name\} followed you`/);
  assert.match(
    client,
    /if \(item\.type === "FOLLOW"\) \{\s*const path = `\/friends\/\$\{encodeURIComponent\(item\.actor\.name\)\}`;/,
  );
  // Read state remains Notification.readAt driven.
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
  const endpoint = `https://push.test/follow-notif/${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  createdEndpoints.push(endpoint);
  await client.pushSubscription.create({
    data: {
      endpoint,
      p256dh: "test-p256dh",
      auth: "test-auth",
      deviceId: `follow-notif-device-${tag}`,
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
    where: { name: { startsWith: "follow_notif_" } },
  });
  await client.pushSubscription.deleteMany({
    where: { endpoint: { startsWith: "https://push.test/follow-notif/" } },
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

test("B following A notifies A exactly once with FOLLOW", { skip: SKIP }, async () => {
  const client = await db();
  const { notifyFollowEvent } = await import(
    "../lib/notifications/notification-service"
  );
  const followerB = await createTestUser("follow_notif_b");
  const targetA = await createTestUser("follow_notif_a");

  const outcome = await followAsRoute(followerB.id, targetA.id);
  assert.equal(outcome, "created");
  await notifyFollowEvent({
    followerId: followerB.id,
    followingId: targetA.id,
  });

  const rows = await client.notification.findMany({
    where: { userId: targetA.id },
  });
  assert.equal(rows.length, 1, "A receives exactly one follow notification");
  assert.equal(rows[0].type, "FOLLOW");
  assert.equal(rows[0].actorId, followerB.id, "actor is the follower");
  assert.equal(rows[0].readAt, null, "notification starts unread");

  const backRows = await client.notification.findMany({
    where: { userId: followerB.id },
  });
  assert.equal(backRows.length, 0, "the follower gets no notification");
});

test("self-follow never notifies", { skip: SKIP }, async () => {
  const client = await db();
  const { notifyFollowEvent } = await import(
    "../lib/notifications/notification-service"
  );
  const userA = await createTestUser("follow_notif_self");

  await notifyFollowEvent({ followerId: userA.id, followingId: userA.id });

  const rows = await client.notification.findMany({
    where: { userId: userA.id },
  });
  assert.equal(rows.length, 0, "no self-notification");
});

test("a retried follow request does not duplicate the notification", {
  skip: SKIP,
}, async () => {
  const client = await db();
  const { notifyFollowEvent } = await import(
    "../lib/notifications/notification-service"
  );
  const followerB = await createTestUser("follow_notif_retry_b");
  const targetA = await createTestUser("follow_notif_retry_a");

  // First request: create + notify (as the route does).
  assert.equal(await followAsRoute(followerB.id, targetA.id), "created");
  await notifyFollowEvent({
    followerId: followerB.id,
    followingId: targetA.id,
  });

  // Retried request: P2002 duplicate — the route skips the notify entirely.
  assert.equal(await followAsRoute(followerB.id, targetA.id), "duplicate");

  const rows = await client.notification.findMany({
    where: { userId: targetA.id },
  });
  assert.equal(rows.length, 1, "one notification after a retry");
});

test("a failed follow operation creates no notification", { skip: SKIP }, async () => {
  const client = await db();
  const { notifyFollowEvent } = await import(
    "../lib/notifications/notification-service"
  );
  const followerB = await createTestUser("follow_notif_fail_b");
  const targetA = await createTestUser("follow_notif_fail_a");

  // No follow row was persisted (the operation failed) — service is a no-op.
  await notifyFollowEvent({
    followerId: followerB.id,
    followingId: targetA.id,
  });

  const rows = await client.notification.findMany({
    where: { userId: targetA.id },
  });
  assert.equal(rows.length, 0);
});

test("Web Push uses the created notification and the actor profile URL", {
  skip: SKIP,
}, async () => {
  const client = await db();
  const { notifyFollowEvent } = await import(
    "../lib/notifications/notification-service"
  );
  sent.length = 0;

  const followerB = await createTestUser("follow_notif_push_b");
  const targetA = await createTestUser("follow_notif_push_a");
  const targetEndpoint = await createTestSubscription(targetA.id, "target");
  await createTestSubscription(followerB.id, "actor");

  await followAsRoute(followerB.id, targetA.id);
  await notifyFollowEvent({
    followerId: followerB.id,
    followingId: targetA.id,
  });

  const rows = await client.notification.findMany({
    where: { userId: targetA.id },
  });
  assert.equal(rows.length, 1);

  assert.equal(sent.length, 1, "only the recipient's subscription receives");
  assert.equal(sent[0].endpoint, targetEndpoint);
  assert.equal(sent[0].payload.type, "FOLLOW");
  assert.equal(sent[0].payload.title, `${followerB.name} followed you`);
  assert.equal(sent[0].payload.url, `/friends/${followerB.name}`);
  assert.equal(sent[0].payload.notificationId, rows[0].id);
  assert.ok(sent[0].payload.createdAt);
});
