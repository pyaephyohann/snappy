/**
 * Social S8 — runtime integration tests (DATABASE_URL-guarded).
 *
 * These assert *behavior* against a real Postgres database, unlike the S1–S7
 * static source assertions. When `DATABASE_URL` is unset every test is skipped
 * and the process exits successfully, so the suite is safe to run anywhere.
 *
 * Database modules are imported lazily: `lib/prisma` throws while loading when
 * `DATABASE_URL` is missing, so a top-level import would break the skip path.
 *
 * Safety: every row is created with a unique run-scoped name and cleanup deletes
 * only those rows (then cascades). Nothing is truncated, reset, or pushed, and
 * no pre-existing data is touched.
 *
 * Run: npm run test:social-integration
 */
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import type { PrismaClient } from "@prisma/client";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const createdUserIds: string[] = [];
let prisma: PrismaClient | null = null;

function db(): PrismaClient {
  assert.ok(prisma, "database client is available");
  return prisma;
}

/** Load the Social modules only when a database is configured. */
async function loadModules() {
  const [chat, relationships, notifications, reactions, presence, sessionUser] =
    await Promise.all([
      import("../lib/chat"),
      import("../lib/relationships"),
      import("../lib/notifications/notification-service"),
      import("../lib/message-reactions"),
      import("../lib/presence"),
      import("../lib/session-user"),
    ]);
  return { chat, relationships, notifications, reactions, presence, sessionUser };
}

async function createUser(label: string, isActive = true) {
  const user = await db().user.create({
    data: {
      name: `s8_${runId}_${label}`,
      profileImage: "https://example.com/s8-integration.jpg",
      isActive,
    },
    select: { id: true, name: true },
  });
  createdUserIds.push(user.id);
  return user;
}

async function createConversation(firstUserId: string, secondUserId: string) {
  const { normalizeUserPair } = await import("../lib/chat");
  const pair = normalizeUserPair(firstUserId, secondUserId);
  assert.ok(pair, "user pair must be distinct");

  return db().conversation.create({
    data: {
      ...pair,
      participants: {
        create: [{ userId: firstUserId }, { userId: secondUserId }],
      },
    },
    select: { id: true },
  });
}

async function createMessage(
  conversationId: string,
  senderId: string,
  content: string,
  createdAt?: Date,
) {
  return db().message.create({
    data: { conversationId, senderId, content, ...(createdAt ? { createdAt } : {}) },
    select: { id: true, createdAt: true },
  });
}

before(async () => {
  if (!hasDatabase) return;
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();
  // Fail fast (with a clear message) when a configured database is unreachable.
  await prisma.$queryRaw`SELECT 1`;
});

after(async () => {
  if (!prisma) return;
  if (createdUserIds.length > 0) {
    // Cascades remove participants, conversations, messages, reactions, notifications.
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

test("non-participants cannot access a conversation while participants can", { skip: !hasDatabase }, async () => {
  const { chat } = await loadModules();
  const [viewer, friend, outsider] = await Promise.all([
    createUser("access-viewer"),
    createUser("access-friend"),
    createUser("access-outsider"),
  ]);
  const conversation = await createConversation(viewer.id, friend.id);
  await createMessage(conversation.id, friend.id, "history");

  assert.equal(await chat.getConversationAccess(outsider.id, conversation.id), null);

  const access = await chat.getConversationAccess(viewer.id, conversation.id);
  assert.ok(access, "participant can read history");
  assert.equal(access.otherParticipant.userId, friend.id);
});

test("unfollow blocks sending but keeps history readable and canMessage server-derived", { skip: !hasDatabase }, async () => {
  const { chat, relationships } = await loadModules();
  const [first, second] = await Promise.all([
    createUser("lifecycle-first"),
    createUser("lifecycle-second"),
  ]);
  const conversation = await createConversation(first.id, second.id);
  await createMessage(conversation.id, second.id, "kept history");

  await db().userFollow.createMany({
    data: [
      { followerId: first.id, followingId: second.id },
      { followerId: second.id, followingId: first.id },
    ],
  });

  assert.equal(await chat.areUsersFriends(first.id, second.id), true);
  assert.ok(await chat.canUseConversation(first.id, conversation.id), "mutual friends can send");
  assert.equal(
    (await relationships.getMutualFriendshipMap(first.id, [second.id])).get(second.id),
    true,
  );

  await db().userFollow.deleteMany({
    where: { followerId: first.id, followingId: second.id },
  });

  assert.equal(await chat.areUsersFriends(first.id, second.id), false);
  assert.equal(
    await chat.canUseConversation(first.id, conversation.id),
    null,
    "unfollow blocks sending",
  );
  assert.ok(
    await chat.getConversationAccess(first.id, conversation.id),
    "history remains readable after unfollow",
  );
  assert.equal(
    (await relationships.getMutualFriendshipMap(first.id, [second.id])).get(second.id),
    false,
  );

  // Refollow restores sending on the same conversation.
  await db().userFollow.create({
    data: { followerId: first.id, followingId: second.id },
  });
  assert.ok(await chat.canUseConversation(first.id, conversation.id), "refollow restores sending");
  assert.equal(
    (await relationships.getMutualFriendshipMap(first.id, [second.id])).get(second.id),
    true,
  );
});

test("inactive users cannot resolve from a signed session", { skip: !hasDatabase }, async () => {
  const { sessionUser } = await loadModules();
  const inactive = await createUser("inactive", false);
  const active = await createUser("active");

  assert.equal(
    await sessionUser.resolveUserFromSession({
      username: inactive.name,
      authenticated: true,
      role: "USER",
      userId: inactive.id,
    }),
    null,
  );
  assert.equal(
    await sessionUser.resolveUserFromSession({
      username: inactive.name,
      authenticated: true,
      role: "USER",
    }),
    null,
  );

  const resolved = await sessionUser.resolveUserFromSession({
    username: active.name,
    authenticated: true,
    role: "USER",
    userId: active.id,
  });
  assert.equal(resolved?.id, active.id);
});

test("active-user pagination is stable and searchable at runtime", { skip: !hasDatabase }, async () => {
  const { relationships } = await loadModules();
  const runPrefix = `s8${runId}p`;
  const names = ["alpha", "bravo", "charlie", "delta", "echo"];
  const created: Array<{ id: string; name: string }> = [];
  for (const name of names) {
    const user = await db().user.create({
      data: { name: `${runPrefix}${name}`, profileImage: "https://example.com/s8-page.jpg" },
      select: { id: true, name: true },
    });
    createdUserIds.push(user.id);
    created.push(user);
  }

  // Keyset paging over a filter restricted to this run's rows.
  const collected: string[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 10; page += 1) {
    const result = await relationships.listUsersForViewerPage({
      viewerId: created[0].id,
      cursor,
      limit: 2,
      query: runPrefix,
    });
    for (const user of result.users) {
      assert.equal(collected.includes(user.id), false, "pages must not overlap");
      collected.push(user.id);
    }
    cursor = result.nextCursor;
    if (!cursor) break;
  }
  assert.equal(collected.length, created.length, "paging must not skip users");
  assert.deepEqual(
    collected,
    created.map((user) => user.id),
    "order is (name asc, id asc)",
  );

  // The viewer can be excluded in the query so callers keep their page size.
  const withoutViewer = await relationships.listUsersForViewerPage({
    viewerId: created[0].id,
    limit: 50,
    query: runPrefix,
    excludeUserId: created[0].id,
  });
  assert.equal(withoutViewer.users.length, created.length - 1);
  assert.equal(
    withoutViewer.users.some((user) => user.id === created[0].id),
    false,
  );

  // A crafted cursor is rejected instead of being trusted into a query.
  assert.equal(relationships.decodeUserListCursor("not-a-cursor"), null);
  assert.equal(
    relationships.decodeUserListCursor(
      Buffer.from(JSON.stringify({ name: "x", id: "../etc" }), "utf8").toString(
        "base64url",
      ),
    ),
    null,
  );
});

test("grouped unread counts match per-conversation counting", { skip: !hasDatabase }, async () => {
  const { chat } = await loadModules();
  const [viewer, friend] = await Promise.all([
    createUser("unread-viewer"),
    createUser("unread-friend"),
  ]);
  const conversation = await createConversation(viewer.id, friend.id);

  const base = Date.UTC(2026, 0, 1, 12, 0, 0);
  await createMessage(conversation.id, friend.id, "one", new Date(base));
  await createMessage(conversation.id, friend.id, "two", new Date(base + 1_000));
  await createMessage(conversation.id, viewer.id, "mine", new Date(base + 2_000));
  const readBoundary = new Date(base + 500);
  await db().conversationParticipant.updateMany({
    where: { conversationId: conversation.id, userId: viewer.id },
    data: { lastReadAt: readBoundary },
  });

  // Reference semantics: the previous per-conversation count() query.
  const expected = await db().message.count({
    where: {
      conversationId: conversation.id,
      senderId: { not: viewer.id },
      createdAt: { gt: readBoundary },
    },
  });
  assert.equal(expected, 1);
  assert.equal(
    (await chat.getUnreadCountsForConversations(viewer.id, [conversation.id])).get(conversation.id),
    expected,
  );

  // Never-read conversations count every incoming message.
  await db().conversationParticipant.updateMany({
    where: { conversationId: conversation.id, userId: viewer.id },
    data: { lastReadAt: null },
  });
  const expectedAll = await db().message.count({
    where: { conversationId: conversation.id, senderId: { not: viewer.id } },
  });
  assert.equal(
    (await chat.getUnreadCountsForConversations(viewer.id, [conversation.id])).get(conversation.id),
    expectedAll,
  );

  // No conversations → no aggregate query, and unknown ids resolve to zero.
  assert.equal((await chat.getUnreadCountsForConversations(viewer.id, [])).size, 0);
});

test("message cursor pagination is stable with identical timestamps", { skip: !hasDatabase }, async () => {
  const { chat } = await loadModules();
  const [first, second] = await Promise.all([
    createUser("cursor-first"),
    createUser("cursor-second"),
  ]);
  const conversation = await createConversation(first.id, second.id);
  const stamp = new Date("2026-02-01T00:00:00.000Z");

  const createdIds: string[] = [];
  for (let index = 0; index < 5; index += 1) {
    const message = await createMessage(conversation.id, first.id, `m${index}`, stamp);
    createdIds.push(message.id);
  }

  const orderBy = [{ createdAt: "desc" as const }, { id: "desc" as const }];
  const firstPage = await db().message.findMany({
    where: { conversationId: conversation.id },
    orderBy,
    take: 3,
    select: { id: true, createdAt: true },
  });
  assert.equal(firstPage.length, 3);

  const oldest = firstPage[firstPage.length - 1];
  const cursor = chat.decodeMessageCursor(
    chat.encodeMessageCursor({
      id: oldest.id,
      createdAt: oldest.createdAt.toISOString(),
    }),
  );
  assert.ok(cursor, "cursor round-trips");

  const secondPage = await db().message.findMany({
    where: {
      conversationId: conversation.id,
      OR: [
        { createdAt: { lt: new Date(cursor.createdAt) } },
        { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
      ],
    },
    orderBy,
    take: 3,
    select: { id: true, createdAt: true },
  });

  const seen = new Set(firstPage.map((message) => message.id));
  for (const message of secondPage) {
    assert.equal(seen.has(message.id), false, "pages must not overlap");
    assert.equal(message.createdAt.getTime(), stamp.getTime());
  }

  const union = [...firstPage, ...secondPage].map((message) => message.id);
  assert.equal(new Set(union).size, createdIds.length);
  for (const id of createdIds) {
    assert.ok(union.includes(id), "pagination must not skip messages");
  }
});

test("presence heartbeat writes are suppressed inside the window", { skip: !hasDatabase }, async () => {
  const { presence } = await loadModules();
  const user = await createUser("presence");

  const conditionalWrite = () =>
    db().user.updateMany({
      where: {
        id: user.id,
        isActive: true,
        OR: [
          { lastSeenAt: null },
          {
            lastSeenAt: {
              lt: new Date(Date.now() - presence.HEARTBEAT_MIN_WRITE_INTERVAL_MS),
            },
          },
        ],
      },
      data: { lastSeenAt: new Date() },
    });

  const first = await conditionalWrite();
  assert.equal(first.count, 1);
  const afterFirst = await db().user.findUnique({
    where: { id: user.id },
    select: { lastSeenAt: true },
  });
  assert.ok(afterFirst?.lastSeenAt);

  const second = await conditionalWrite();
  assert.equal(second.count, 0, "second heartbeat inside the window is suppressed");
  const afterSecond = await db().user.findUnique({
    where: { id: user.id },
    select: { lastSeenAt: true },
  });
  assert.deepEqual(afterSecond?.lastSeenAt, afterFirst?.lastSeenAt);

  await db().user.update({
    where: { id: user.id },
    data: {
      lastSeenAt: new Date(
        Date.now() - presence.HEARTBEAT_MIN_WRITE_INTERVAL_MS - 1_000,
      ),
    },
  });
  const third = await conditionalWrite();
  assert.equal(third.count, 1, "a stale heartbeat writes again");

  // Presence stays derived, never stored as a boolean.
  assert.equal(
    presence.serializePresence({ lastSeenAt: new Date(), isActive: true }).isOnline,
    true,
  );
  assert.equal(
    presence.serializePresence({
      lastSeenAt: new Date(Date.now() - 120_000),
      isActive: true,
    }).isOnline,
    false,
  );
  assert.equal(
    presence.serializePresence({ lastSeenAt: new Date(), isActive: false }).isOnline,
    false,
  );
});

test("concurrent reaction mutations stay unique and do not fail", { skip: !hasDatabase }, async () => {
  const { reactions } = await loadModules();
  const [viewer, friend] = await Promise.all([
    createUser("reaction-viewer"),
    createUser("reaction-friend"),
  ]);
  const conversation = await createConversation(viewer.id, friend.id);
  const message = await createMessage(conversation.id, friend.id, "react to me");

  const settled = await Promise.allSettled([
    reactions.toggleReaction(viewer.id, conversation.id, message.id, "❤️"),
    reactions.toggleReaction(viewer.id, conversation.id, message.id, "😂"),
    reactions.toggleReaction(viewer.id, conversation.id, message.id, "👍"),
    reactions.toggleReaction(viewer.id, conversation.id, message.id, "❤️"),
    reactions.removeReaction(viewer.id, conversation.id, message.id),
    reactions.toggleReaction(viewer.id, conversation.id, message.id, "😮"),
  ]);

  for (const result of settled) {
    assert.equal(
      result.status,
      "fulfilled",
      result.status === "rejected" ? String(result.reason) : "",
    );
  }

  const rows = await db().messageReaction.count({
    where: { userId: viewer.id, messageId: message.id },
  });
  assert.ok(rows <= 1, `expected at most one reaction row, found ${rows}`);

  // A concurrent toggle-off can legitimately leave zero rows; make sure one
  // exists, then prove the database still rejects a duplicate.
  if (rows === 0) {
    await db().messageReaction.create({
      data: { userId: viewer.id, messageId: message.id, type: "❤️" },
    });
  }
  const duplicate = await db()
    .messageReaction.create({
      data: { userId: viewer.id, messageId: message.id, type: "👎" },
    })
    .then(() => true)
    .catch(() => false);
  assert.equal(duplicate, false, "unique (userId, messageId) still enforced");
});

test("new message notifications are idempotent and never target the sender", { skip: !hasDatabase }, async () => {
  const { notifications } = await loadModules();
  const [sender, recipient] = await Promise.all([
    createUser("notify-sender"),
    createUser("notify-recipient"),
  ]);
  const conversation = await createConversation(sender.id, recipient.id);
  const message = await createMessage(conversation.id, sender.id, "hello there");

  await notifications.createNewMessageNotification({ messageId: message.id });
  await notifications.createNewMessageNotification({ messageId: message.id });

  const stored = await db().notification.findMany({
    where: { messageId: message.id },
    select: { type: true, userId: true, actorId: true, body: true },
  });

  assert.equal(stored.length, 1, "exactly one notification per message");
  assert.equal(stored[0].type, "NEW_MESSAGE");
  assert.equal(stored[0].userId, recipient.id);
  assert.equal(stored[0].actorId, sender.id);
  assert.equal(stored[0].body, "hello there");

  assert.equal(
    await db().notification.count({ where: { messageId: message.id, userId: sender.id } }),
    0,
    "sender is never notified",
  );
});

test("notification previews never split a surrogate pair", { skip: !hasDatabase }, async () => {
  const { notifications } = await loadModules();
  const [sender, recipient] = await Promise.all([
    createUser("preview-sender"),
    createUser("preview-recipient"),
  ]);
  const conversation = await createConversation(sender.id, recipient.id);

  // 159 BMP characters push the 160th UTF-16 unit into the middle of the emoji,
  // which is exactly where a naive slice() would leave a lone surrogate.
  const content = `${"a".repeat(159)}👍${"b".repeat(10)}`;
  assert.equal(
    [...notifications.buildNotificationPreview(content)].length,
    notifications.MAX_NOTIFICATION_PREVIEW_CODE_POINTS,
  );

  const message = await createMessage(conversation.id, sender.id, content);
  await notifications.createNewMessageNotification({ messageId: message.id });

  const stored = await db().notification.findFirst({
    where: { messageId: message.id },
    select: { body: true },
  });
  assert.equal(stored?.body, `${"a".repeat(159)}👍`);

  const loneSurrogate =
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  assert.doesNotMatch(stored?.body ?? "", loneSurrogate);
});
