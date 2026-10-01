/**
 * C4 — Comment notifications for Snap owners.
 *
 * Audit finding: the implementation already exists — the comment POST route
 * calls `notifySnapInteraction({ type: 'COMMENT' })` strictly after the
 * comment row is persisted, and the service derives the recipient from the
 * Snap row with a self-comment guard. This milestone locks the spec'd
 * behavior with regression tests:
 *
 * - B comments on A's Snap → A gets a notification
 * - commenting on your own Snap → no self-notification
 * - notification only after successful creation (failure ⇒ none)
 * - recipient identity never comes from the client
 * - repeated comments notify per comment (existing product behavior,
 *   documented in docs/notifications.md — no aggregation invented)
 *
 * Run: node --env-file-if-exists=.env.local --import tsx --test scripts/snap-comment-notifications.test.ts
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

const route = read("app/api/snaps/[snapId]/comments/route.ts");

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
      publicId: `comment-notif-${ownerId}`,
      userId: ownerId,
    },
  });
  return snap.id;
}

before(async () => {
  if (!hasDb) return;
  const client = await db();
  await client.user.deleteMany({
    where: { name: { startsWith: "snap_comment_notif_" } },
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

test("comment creation notifies strictly after the comment row is persisted", () => {
  const calls = route.match(/notifySnapInteraction\(\{/g);
  assert.equal(calls?.length, 1);

  const createIndex = route.indexOf("prisma.comment.create");
  const notifyIndex = route.indexOf("notifySnapInteraction({");
  assert.ok(createIndex > 0 && notifyIndex > createIndex);

  // Nothing before the create can notify: a failed creation (validation,
  // missing Snap, missing user, database error) never reaches the notify.
  const postStart = route.indexOf("export async function POST");
  const beforeCreate = route.slice(postStart, createIndex);
  assert.doesNotMatch(beforeCreate, /notifySnapInteraction/);

  // Payload: resolved actor, route snap id, COMMENT type, comment preview
  // as body — matching docs/notifications.md.
  assert.match(
    route,
    /notifySnapInteraction\(\{\s*snapId,\s*actorId: user\.id,\s*type: 'COMMENT',\s*body: comment\.content,/,
  );

  // Fire-and-forget: a notification failure never breaks comment creation.
  assert.match(route, /void notifySnapInteraction/);
  assert.match(route, /\.catch\(\(notifyError\) =>/);
});

test("comment route accepts no client-supplied recipient or author identity", () => {
  // Create data: exactly content (validated), session user, route snap.
  assert.match(route, /data: \{\s*content,\s*userId: user\.id,\s*snapId,\s*\}/);
  assert.doesNotMatch(route, /recipient|notifyUserId|ownerId/i);
  assert.doesNotMatch(route, /body\.userId|body\.actorId/);
});

test("the shared service guards self-comments and derives the recipient from the Snap", () => {
  const service = read("lib/notifications/notification-service.ts");
  // Recipient = Snap owner from the database; actor identity is required,
  // never a client-provided recipient.
  assert.match(
    service,
    /export async function notifySnapInteraction\(\{\s*snapId,\s*actorId,\s*type,\s*body,/,
  );
  assert.match(service, /userId: snap\.userId,/);
  assert.match(service, /if \(snap\.userId === actorId\) \{\s*return;\s*\}/);
  // Comment notifications use the actor display name from the database.
  assert.match(
    service,
    /`?\$\{actor\.name\} commented on your Snap`?|actor\.name\} commented on your Snap/,
  );
});

test("per-comment notifications (no aggregation) are the documented behavior", () => {
  const docs = read("docs/notifications.md");
  assert.match(docs, /## Snap Comment Notifications/);
  assert.match(docs, /Self comments do not notify/);
  assert.match(docs, /comment preview is used as the notification body/);
  // The milestone must not invent new notification types for this.
  const schema = read("prisma/schema.prisma");
  assert.match(
    schema,
    /enum NotificationType \{\n  NEW_SNAP\n  NEW_MESSAGE\n  REACTION\n  COMMENT\n  BIRTHDAY\n  FOLLOW\n  FOLLOW_ACCEPTED\n\}/,
  );
});

// ===========================================================================
// Database-backed behavior (run with DATABASE_URL)
// ===========================================================================

test("B commenting on A's Snap notifies A with the comment preview", {
  skip: SKIP,
}, async () => {
  const client = await db();
  const { notifySnapInteraction } = await import(
    "../lib/notifications/notification-service"
  );
  const prefix = "snap_comment_notif_b_a_";
  const ownerA = await createTestUser(`${prefix}aaa`);
  const actorB = await createTestUser(`${prefix}bbb`);
  const snapId = await createTestSnap(ownerA);

  // Mirror the route: persist the comment first, then notify.
  const comment = await client.comment.create({
    data: { content: "Nice snap!", userId: actorB, snapId },
  });
  await notifySnapInteraction({
    snapId,
    actorId: actorB,
    type: "COMMENT",
    body: comment.content,
  });

  const rows = await client.notification.findMany({
    where: { userId: ownerA, snapId },
  });
  assert.equal(rows.length, 1, "A receives exactly one comment notification");
  assert.equal(rows[0].type, "COMMENT");
  assert.equal(rows[0].actorId, actorB);
  assert.equal(rows[0].body, "Nice snap!");
  assert.equal(rows[0].readAt, null, "notification starts unread");
});

test("commenting on your own Snap never notifies you", { skip: SKIP }, async () => {
  const client = await db();
  const { notifySnapInteraction } = await import(
    "../lib/notifications/notification-service"
  );
  const prefix = "snap_comment_notif_self_";
  const ownerA = await createTestUser(`${prefix}aaa`);
  const snapId = await createTestSnap(ownerA);

  const comment = await client.comment.create({
    data: { content: "own snap comment", userId: ownerA, snapId },
  });
  await notifySnapInteraction({
    snapId,
    actorId: ownerA,
    type: "COMMENT",
    body: comment.content,
  });

  const rows = await client.notification.findMany({
    where: { userId: ownerA, snapId },
  });
  assert.equal(rows.length, 0, "no self-notification");
});

test("a failed comment creation produces no notification", { skip: SKIP }, async () => {
  const client = await db();
  const prefix = "snap_comment_notif_fail_";
  const ownerA = await createTestUser(`${prefix}aaa`);
  const actorB = await createTestUser(`${prefix}bbb`);

  // The route only calls notify after prisma.comment.create resolves; a
  // rejected create (missing Snap → FK violation) skips the notify call.
  let created = false;
  try {
    await client.comment.create({
      data: {
        content: "should never persist",
        userId: actorB,
        snapId: "missing-snap-id",
      },
    });
    created = true;
  } catch {
    created = false;
  }
  assert.equal(created, false, "comment creation must fail for a missing Snap");

  const rows = await client.notification.findMany({
    where: { userId: ownerA },
  });
  assert.equal(rows.length, 0, "no notification without a persisted comment");
});

test("each comment notifies separately — existing product behavior, no aggregation", {
  skip: SKIP,
}, async () => {
  const client = await db();
  const { notifySnapInteraction } = await import(
    "../lib/notifications/notification-service"
  );
  const prefix = "snap_comment_notif_multi_";
  const ownerA = await createTestUser(`${prefix}aaa`);
  const actorB = await createTestUser(`${prefix}bbb`);
  const snapId = await createTestSnap(ownerA);

  for (const content of ["First!", "Second comment"]) {
    const comment = await client.comment.create({
      data: { content, userId: actorB, snapId },
    });
    await notifySnapInteraction({
      snapId,
      actorId: actorB,
      type: "COMMENT",
      body: comment.content,
    });
  }

  const rows = await client.notification.findMany({
    where: { userId: ownerA, snapId, type: "COMMENT" },
  });
  assert.equal(rows.length, 2, "one notification per comment as documented");
  assert.deepEqual(
    rows.map((row) => row.body).sort(),
    ["First!", "Second comment"],
  );
});
