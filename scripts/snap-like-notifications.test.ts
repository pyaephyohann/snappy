/**
 * C3 — Like notifications for Snap owners.
 *
 * Audit finding: the implementation already exists — the reaction route
 * calls `notifySnapInteraction({ type: 'REACTION' })` only on its create
 * path, and the service derives the recipient from the Snap row. This
 * milestone locks the spec'd behavior with regression tests:
 *
 * - B likes A's Snap → A gets a notification
 * - A liking their own Snap → no self-notification
 * - B likes then unlikes → one like notification, no unlike notification
 * - duplicate like request → no duplicate notification
 * - recipient identity never comes from the client
 *
 * Run: node --env-file-if-exists=.env.local --import tsx --test scripts/snap-like-notifications.test.ts
 */

import "./test-db-guard";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PrismaClient } from "@prisma/client";

const hasDb = Boolean(process.env.DATABASE_URL);
const SKIP = !hasDb ? "DATABASE_URL not set" : false;

const root = resolve(import.meta.dirname, "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const route = read("app/api/snaps/[snapId]/reaction/route.ts");
const service = read("lib/notifications/notification-service.ts");

let prisma: PrismaClient | null = null;
const testUserIds: string[] = [];

async function db(): Promise<PrismaClient> {
  if (!prisma) {
    const { PrismaClient: PrismaClientCtor } = await import("@prisma/client");
    prisma = new PrismaClientCtor();
  }
  return prisma;
}

async function createTestUser(namePrefix: string): Promise<string> {
  const client = await db();
  const user = await client.user.create({
    data: {
      name: `${namePrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      profileImage: "https://example.com/avatar.jpg",
    },
  });
  testUserIds.push(user.id);
  return user.id;
}

async function createTestSnap(ownerId: string): Promise<string> {
  const client = await db();
  const snap = await client.snap.create({
    data: {
      imageUrl: "https://example.com/snap.jpg",
      publicId: `like-notif-${ownerId}`,
      userId: ownerId,
    },
  });
  return snap.id;
}

before(async () => {
  if (!hasDb) return;
  const client = await db();
  await client.user.deleteMany({
    where: { name: { startsWith: "snap_like_notif_" } },
  });
});

after(async () => {
  if (!prisma) return;
  for (const userId of testUserIds) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

// ===========================================================================
// Source-level wiring (always run)
// ===========================================================================

test("reaction route notifies only on the create path", () => {
  // Exactly one notification call in the whole route.
  const calls = route.match(/notifySnapInteraction\(\{/g);
  assert.equal(calls?.length, 1);

  // The call sits strictly after prisma.reaction.create: the toggle-off
  // (delete) and replace (update) branches return before it, so unlike and
  // re-type operations never notify.
  const createIndex = route.indexOf("prisma.reaction.create");
  const notifyIndex = route.indexOf("notifySnapInteraction({");
  assert.ok(createIndex > 0 && notifyIndex > createIndex);
  const beforeCreate = route.slice(
    route.indexOf("export async function POST"),
    createIndex,
  );
  assert.doesNotMatch(beforeCreate, /notifySnapInteraction/);

  // Payload: authenticated actor, resolved snap, fixed REACTION type.
  assert.match(
    route,
    /notifySnapInteraction\(\{\s*snapId,\s*actorId: user\.id,\s*type: 'REACTION',/,
  );

  // Fire-and-forget: a notification failure never breaks the like response.
  assert.match(route, /void notifySnapInteraction/);
  assert.match(route, /\.catch\(\(notifyError\) =>/);

  // No client-controlled recipient anywhere in the route.
  assert.doesNotMatch(route, /recipient|notifyUserId|ownerId/i);
});

test("a repeated like request returns on the existing-reaction path without notifying", () => {
  // The unique (userId, snapId) row makes a second identical POST hit the
  // existing-reaction branch — which returns before the notify call.
  assert.match(route, /prisma\.reaction\.findUnique\(\{\s*where:\s*\{\s*userId_snapId:/);
  assert.match(route, /if \(existingReaction\.type === type\) \{/);
  assert.match(route, /reaction: null/);
  const deleteIndex = route.indexOf("prisma.reaction.delete");
  const notifyIndex = route.indexOf("notifySnapInteraction({");
  assert.ok(deleteIndex > 0 && deleteIndex < notifyIndex);

  // The model enforces one reaction per (user, snap) — no duplicate rows.
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /@@unique\(\[userId, snapId\]\)/);
});

test("the service derives the recipient from the Snap and guards self-notifications", () => {
  // notifySnapInteraction inputs: snap reference + actor only — no recipient.
  assert.match(
    service,
    /export async function notifySnapInteraction\(\{\s*snapId,\s*actorId,\s*type,\s*body,/,
  );
  assert.match(service, /snapId: string;/);
  assert.match(service, /actorId: string;/);
  assert.match(service, /type: "REACTION" \| "COMMENT";/);

  // Recipient = Snap owner, read from the database — never client input.
  assert.match(service, /prisma\.snap\.findUnique\(\{\s*where: \{ id: snapId \},\s*select: \{ userId: true \},/);
  assert.match(service, /userId: snap\.userId,/);

  // Never notify a user about their own like.
  assert.match(
    service,
    /if \(snap\.userId === actorId\) \{\s*return;\s*\}/,
  );
});

// ===========================================================================
// Database-backed behavior (run with DATABASE_URL)
// ===========================================================================

test("B liking A's Snap notifies A exactly once", { skip: SKIP }, async () => {
  const client = await db();
  const { notifySnapInteraction } = await import(
    "../lib/notifications/notification-service"
  );
  const prefix = "snap_like_notif_b_a_";
  const ownerA = await createTestUser(`${prefix}aaa`);
  const actorB = await createTestUser(`${prefix}bbb`);
  const snapId = await createTestSnap(ownerA);

  // Mirror the route: persist the like, then notify.
  await client.reaction.create({
    data: { type: "LIKE", userId: actorB, snapId },
  });
  await notifySnapInteraction({
    snapId,
    actorId: actorB,
    type: "REACTION",
    body: "👍",
  });

  const rows = await client.notification.findMany({
    where: { userId: ownerA, snapId },
  });
  assert.equal(rows.length, 1, "A receives exactly one like notification");
  assert.equal(rows[0].type, "REACTION");
  assert.equal(rows[0].actorId, actorB);
  assert.equal(rows[0].body, "👍");
  assert.equal(rows[0].readAt, null, "notification starts unread");
});

test("liking your own Snap never notifies you", { skip: SKIP }, async () => {
  const client = await db();
  const { notifySnapInteraction } = await import(
    "../lib/notifications/notification-service"
  );
  const prefix = "snap_like_notif_self_";
  const ownerA = await createTestUser(`${prefix}aaa`);
  const snapId = await createTestSnap(ownerA);

  await client.reaction.create({
    data: { type: "LIKE", userId: ownerA, snapId },
  });
  await notifySnapInteraction({
    snapId,
    actorId: ownerA,
    type: "REACTION",
    body: "👍",
  });

  const rows = await client.notification.findMany({
    where: { userId: ownerA, snapId },
  });
  assert.equal(rows.length, 0, "no self-notification");
});

test("B likes then unlikes: one like notification and no unlike notification", {
  skip: SKIP,
}, async () => {
  const client = await db();
  const { notifySnapInteraction } = await import(
    "../lib/notifications/notification-service"
  );
  const prefix = "snap_like_notif_toggle_";
  const ownerA = await createTestUser(`${prefix}aaa`);
  const actorB = await createTestUser(`${prefix}bbb`);
  const snapId = await createTestSnap(ownerA);

  // Like → notify (create path).
  const reaction = await client.reaction.create({
    data: { type: "LIKE", userId: actorB, snapId },
  });
  await notifySnapInteraction({
    snapId,
    actorId: actorB,
    type: "REACTION",
    body: "👍",
  });

  // Unlike → route deletes the row and returns before notify; nothing new.
  await client.reaction.delete({ where: { id: reaction.id } });

  const rows = await client.notification.findMany({
    where: { userId: ownerA, snapId },
  });
  assert.equal(rows.length, 1, "still exactly one notification after unlike");
  assert.equal(rows[0].type, "REACTION");

  // The enum has no UNLIKE type — an unlike can never be represented.
  const schema = read("prisma/schema.prisma");
  assert.doesNotMatch(schema, /UNLIKE/);
});

test("re-liking after an unlike creates a second like notification (existing product behavior)", {
  skip: SKIP,
}, async () => {
  const client = await db();
  const { notifySnapInteraction } = await import(
    "../lib/notifications/notification-service"
  );
  const prefix = "snap_like_notif_relike_";
  const ownerA = await createTestUser(`${prefix}aaa`);
  const actorB = await createTestUser(`${prefix}bbb`);
  const snapId = await createTestSnap(ownerA);

  // like → notify, unlike (no notify), like again → new create path → notify.
  await client.reaction.create({
    data: { type: "LIKE", userId: actorB, snapId },
  });
  await notifySnapInteraction({ snapId, actorId: actorB, type: "REACTION" });
  await client.reaction.deleteMany({ where: { userId: actorB, snapId } });
  await client.reaction.create({
    data: { type: "LIKE", userId: actorB, snapId },
  });
  await notifySnapInteraction({ snapId, actorId: actorB, type: "REACTION" });

  const rows = await client.notification.findMany({
    where: { userId: ownerA, snapId, type: "REACTION" },
  });
  assert.equal(rows.length, 2);

  // Duplicate request while already liked never doubles up: the route's
  // findUnique branch returns first (covered by the source test above), so
  // two calls for one persisted like cannot both notify.
  const persisted = await client.reaction.count({
    where: { userId: actorB, snapId },
  });
  assert.equal(persisted, 1);
});
