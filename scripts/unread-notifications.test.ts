/**
 * N2 — Server Unread Badge.
 *
 * Audit finding: the server count API and the shared nav badge already
 * existed — `GET /api/notifications/unread-count` performs a session-scoped
 * database count (`readAt IS NULL`) and `useUnreadNotificationCount` feeds
 * both the web and Telegram navigations. N2 extracts the count into one
 * server helper, adds the missing badge refresh after a mark-read mutation,
 * and locks the whole contract with tests:
 *
 * - unread = `Notification.readAt IS NULL`, counted in the database
 * - the owner always comes from the session, never from the client
 * - counts are isolated per user
 * - N1 push mutes never make a notification read
 * - `Notification.readAt` stays independent of chat `lastReadAt`
 *
 * Run: node --env-file-if-exists=.env.local --import tsx --test scripts/unread-notifications.test.ts
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

const countRoute = read("app/api/notifications/unread-count/route.ts");
const countHelper = read("lib/notifications/unread-count.ts");
const hook = read("hooks/useUnreadNotificationCount.ts");
const webNav = read("components/mobile/BottomNav.tsx");
const telegramNav = read("components/telegram/TelegramBottomNav.tsx");
const notificationsClient = read(
  "components/notifications/NotificationsPageClient.tsx",
);
const readOneRoute = read("app/api/notifications/[id]/read/route.ts");
const readAllRoute = read("app/api/notifications/read-all/route.ts");
const listRoute = read("app/api/notifications/route.ts");
const schema = read("prisma/schema.prisma");

// ===========================================================================
// Server-side contract (always run)
// ===========================================================================

test("the unread count is a session-scoped database count", () => {
  // Ownership comes from the session; the route accepts no request input, so
  // a client can never ask for another user's count.
  assert.match(countRoute, /export async function GET\(\)/);
  assert.match(countRoute, /requireSession\(\)/);
  assert.match(countRoute, /resolveUserFromSession\(session\)/);
  assert.match(countRoute, /countUnreadNotifications\(user\.id\)/);
  assert.match(countRoute, /status: 401/);
  assert.match(countRoute, /status: 404/);
  assert.doesNotMatch(countRoute, /searchParams|params|request/i);

  // The single counting path is a DB-side count on the indexed predicate:
  // no joins, no notification content loaded.
  assert.match(
    countHelper,
    /prisma\.notification\.count\(\{\s*where: \{ userId, readAt: null \},\s*\}\)/,
  );
  assert.doesNotMatch(countHelper, /findMany|include|select|lastReadAt/);

  // The list API is not a second counting path.
  assert.doesNotMatch(listRoute, /unread/i);
});

test("the badge is server-driven in both navigations", () => {
  // Initial state comes from the server; failures keep the previous count
  // instead of fabricating one.
  assert.match(
    hook,
    /fetch\("\/api\/notifications\/unread-count", \{\s*cache: "no-store",\s*\}\)/,
  );
  assert.match(hook, /setCount\(data\.count\)/);
  assert.match(hook, /window\.addEventListener\("focus", onFocus\)/);
  assert.match(
    hook,
    /window\.addEventListener\(NOTIFICATIONS_UPDATED_EVENT, onUpdated\)/,
  );
  assert.match(hook, /keep previous count/);
  // The error path keeps the previous server value — it never writes a fake 0.
  const catchBlock = hook.slice(hook.indexOf("} catch {"));
  assert.ok(catchBlock.length > 0);
  assert.doesNotMatch(catchBlock, /setCount/);

  // No new polling/transport framework.
  assert.doesNotMatch(hook, /setInterval|WebSocket|EventSource|BroadcastChannel/);

  for (const nav of [webNav, telegramNav]) {
    assert.match(nav, /useUnreadNotificationCount\(\)/);
    // 0 → hidden; >0 → badge; existing cap convention preserved.
    assert.match(nav, /badgeCount > 0 \?/);
    assert.match(nav, /badgeCount > 9 \? "9\+" : badgeCount/);
  }
});

test("a confirmed mark-read refreshes the authoritative badge", () => {
  assert.match(notificationsClient, /notifyNotificationsUpdated/);
  assert.match(
    notificationsClient,
    /\.then\(\(res\) => \{[\s\S]{0,200}if \(res\.ok\) \{\s*notifyNotificationsUpdated\(\);/,
  );
  // The badge is never decremented client-side.
  assert.doesNotMatch(notificationsClient, /unreadCount\s*[-+]=|count\s*-\s*1/);
});

test("read mutations stay owner-scoped and never touch chat read state", () => {
  // Per-notification read: only the owner's own unread row transitions.
  assert.match(readOneRoute, /requireSession\(\)/);
  assert.match(readOneRoute, /where: \{ id, userId: user\.id, readAt: null \}/);
  assert.match(readOneRoute, /result\.count === 0/);
  assert.match(readOneRoute, /status: 404/);

  // Mark all read: owner's unread rows only.
  assert.match(readAllRoute, /requireSession\(\)/);
  assert.match(readAllRoute, /where: \{ userId: user\.id, readAt: null \}/);
  assert.match(readAllRoute, /data: \{ readAt: new Date\(\) \}/);

  for (const route of [readOneRoute, readAllRoute]) {
    assert.doesNotMatch(route, /lastReadAt|conversationParticipant/i);
    assert.doesNotMatch(route, /body\.userId|params\.userId/);
  }
});

test("the count predicate is already indexed — no migration required", () => {
  assert.match(schema, /@@index\(\[userId, readAt\]\)/);
});

// ===========================================================================
// Database-backed behavior (run with DATABASE_URL)
// ===========================================================================

let prisma: PrismaClient | null = null;
const testUserIds: string[] = [];

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

async function countUnread(userId: string): Promise<number> {
  const { countUnreadNotifications } = await import(
    "../lib/notifications/unread-count"
  );
  return countUnreadNotifications(userId);
}

async function createNotifications(
  userId: string,
  actorId: string,
  count: number,
): Promise<string[]> {
  const client = await db();
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const row = await client.notification.create({
      data: { type: "FOLLOW", userId, actorId },
    });
    ids.push(row.id);
  }
  return ids;
}

before(async () => {
  if (!hasDb) return;
  const client = await db();
  await client.user.deleteMany({
    where: { name: { startsWith: "unread_badge_" } },
  });
});

after(async () => {
  if (!prisma) return;
  if (testUserIds.length > 0) {
    // Cascades remove notifications, preferences, conversations, messages.
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
  }
  await prisma.$disconnect();
});

test("0 unread → 0, 1 unread → 1, many unread → the exact count", {
  skip: SKIP,
}, async () => {
  const user = await createTestUser("unread_badge_basic");
  const actor = await createTestUser("unread_badge_basic_actor");

  assert.equal(await countUnread(user.id), 0);

  await createNotifications(user.id, actor.id, 1);
  assert.equal(await countUnread(user.id), 1);

  await createNotifications(user.id, actor.id, 2);
  assert.equal(await countUnread(user.id), 3);
});

test("read notifications are not counted", { skip: SKIP }, async () => {
  const client = await db();
  const user = await createTestUser("unread_badge_read");
  const actor = await createTestUser("unread_badge_read_actor");
  const ids = await createNotifications(user.id, actor.id, 3);

  assert.equal(await countUnread(user.id), 3);

  await client.notification.update({
    where: { id: ids[0] },
    data: { readAt: new Date() },
  });
  assert.equal(await countUnread(user.id), 2, "read row is excluded");

  await client.notification.updateMany({
    where: { userId: user.id },
    data: { readAt: new Date() },
  });
  assert.equal(await countUnread(user.id), 0);
});

test("counts are isolated per user", { skip: SKIP }, async () => {
  const client = await db();
  const userA = await createTestUser("unread_badge_iso_a");
  const userB = await createTestUser("unread_badge_iso_b");
  const actor = await createTestUser("unread_badge_iso_actor");

  await createNotifications(userA.id, actor.id, 3);
  await createNotifications(userB.id, actor.id, 2);

  assert.equal(await countUnread(userA.id), 3, "A sees A's count only");
  assert.equal(await countUnread(userB.id), 2, "B sees B's count only");

  // Reading all of A's notifications never changes B's count.
  await client.notification.updateMany({
    where: { userId: userA.id, readAt: null },
    data: { readAt: new Date() },
  });
  assert.equal(await countUnread(userA.id), 0);
  assert.equal(await countUnread(userB.id), 2);
});

test("a muted push channel still counts the notification as unread (N1 compatibility)", {
  skip: SKIP,
}, async () => {
  const client = await db();
  const { updateNotificationPreferences } = await import(
    "../lib/notifications/notification-preferences"
  );
  const { createNewMessageNotification } = await import(
    "../lib/notifications/notification-service"
  );
  const sender = await createTestUser("unread_badge_msg_s");
  const recipient = await createTestUser("unread_badge_msg_r");

  // Recipient muted message push entirely.
  await updateNotificationPreferences(recipient.id, { message: false });

  const [lowId, highId] = [sender.id, recipient.id].sort();
  const conversation = await client.conversation.create({
    data: {
      userLowId: lowId,
      userHighId: highId,
      participants: {
        create: [{ userId: sender.id }, { userId: recipient.id }],
      },
    },
  });
  const message = await client.message.create({
    data: {
      conversationId: conversation.id,
      senderId: sender.id,
      content: "Muted push but still unread",
    },
  });
  await createNewMessageNotification({ messageId: message.id });

  const rows = await client.notification.findMany({
    where: { userId: recipient.id, type: "NEW_MESSAGE" },
  });
  assert.equal(rows.length, 1, "the Notification row is created regardless of mute");
  assert.equal(rows[0].readAt, null, "mute never marks the notification read");
  assert.equal(await countUnread(recipient.id), 1, "muted push still counts");
});

test("per-notification mark read decreases the count", { skip: SKIP }, async () => {
  const client = await db();
  const user = await createTestUser("unread_badge_one");
  const actor = await createTestUser("unread_badge_one_actor");
  const [notificationId] = await createNotifications(user.id, actor.id, 3);

  // Mirror of PATCH /api/notifications/[id]/read.
  const first = await client.notification.updateMany({
    where: { id: notificationId, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  assert.equal(first.count, 1);
  assert.equal(await countUnread(user.id), 2);

  // Re-marking the same notification is a no-op.
  const again = await client.notification.updateMany({
    where: { id: notificationId, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  assert.equal(again.count, 0);
  assert.equal(await countUnread(user.id), 2);
});

test("mark all read zeroes the owner's count and leaves chat read state untouched", {
  skip: SKIP,
}, async () => {
  const client = await db();
  const userA = await createTestUser("unread_badge_all_a");
  const userB = await createTestUser("unread_badge_all_b");
  const actor = await createTestUser("unread_badge_all_actor");

  await createNotifications(userA.id, actor.id, 3);
  await createNotifications(userB.id, actor.id, 2);

  // A chat participant read timestamp must be unaffected by notification reads.
  const [lowId, highId] = [userA.id, userB.id].sort();
  const conversation = await client.conversation.create({
    data: {
      userLowId: lowId,
      userHighId: highId,
      participants: {
        create: [{ userId: userA.id }, { userId: userB.id }],
      },
    },
  });
  const chatReadAt = new Date(Date.now() - 60_000);
  await client.conversationParticipant.updateMany({
    where: { conversationId: conversation.id, userId: userA.id },
    data: { lastReadAt: chatReadAt },
  });

  // Mirror of POST /api/notifications/read-all.
  await client.notification.updateMany({
    where: { userId: userA.id, readAt: null },
    data: { readAt: new Date() },
  });

  assert.equal(await countUnread(userA.id), 0, "badge count becomes 0");
  assert.equal(await countUnread(userB.id), 2, "B is untouched");

  const participant = await client.conversationParticipant.findFirst({
    where: { conversationId: conversation.id, userId: userA.id },
  });
  assert.ok(participant);
  assert.equal(
    participant.lastReadAt?.getTime(),
    chatReadAt.getTime(),
    "chat lastReadAt is independent of notification read state",
  );
});
