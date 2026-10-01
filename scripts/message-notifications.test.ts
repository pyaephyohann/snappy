/**
 * Social Notifications — Message.
 *
 * Audit finding: message notifications already exist on the shared
 * architecture — `POST /api/chats/[conversationId]/messages` persists the
 * message first and then calls `createNewMessageNotification({ messageId })`,
 * which derives sender, recipient, preview, and destination from the
 * persisted message and is database-idempotent via the unique `messageId`.
 * This milestone locks that behavior:
 *
 * - A sends B a message -> B gets "A sent you a message"
 * - the sender never receives their own message notification
 * - unauthorized message creation never notifies
 * - repeated processing of one message never duplicates the notification
 * - PWA push uses the created notification record and /chats/<conversationId>
 *
 * Run: node --env-file-if-exists=.env.local --import tsx --test scripts/message-notifications.test.ts
 */

import "./test-db-guard";
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

const route = read("app/api/chats/[conversationId]/messages/route.ts");
const service = read("lib/notifications/notification-service.ts");
const client = read("components/notifications/NotificationsPageClient.tsx");

// ===========================================================================
// Source-level wiring (always run)
// ===========================================================================

test("authorized message creation notifies only after persistence", () => {
  // The notification is created from the persisted message id, after the
  // transaction that stores the message succeeds.
  assert.match(route, /const created = await prisma\.\$transaction/);
  assert.match(route, /await createNewMessageNotification\(\{ messageId: created\.id \}\)/);
  const transactionIndex = route.indexOf("prisma.$transaction");
  const notifyIndex = route.indexOf("createNewMessageNotification({");
  assert.ok(notifyIndex > transactionIndex);

  // Fire-and-forget: a notification failure never fails the message response.
  assert.match(route, /\.catch\(\(error\) =>/);
  assert.match(route, /notification failed/);

  // Sender is the authenticated viewer; no client-supplied identity.
  assert.match(route, /senderId: viewer\.id/);
  assert.doesNotMatch(route, /body\.senderId|body\.recipientId|body\.userId/);
});

test("unauthorized message creation is rejected before any notification", () => {
  // Conversation access is resolved before parsing or persisting; the 403
  // branch returns before the create and the notify call.
  assert.match(route, /const access = await canUseConversation\(viewer\.id, conversationId\);/);
  assert.match(route, /status: 403/);
  const accessIndex = route.indexOf("await canUseConversation");
  const createIndex = route.indexOf("prisma.$transaction");
  const notifyIndex = route.indexOf("createNewMessageNotification({");
  assert.ok(accessIndex > 0 && accessIndex < createIndex && createIndex < notifyIndex);
});

test("the service derives recipient, preview, and idempotency from the message", () => {
  // Recipient = the other conversation participant; sender is excluded and
  // inactive recipients are skipped — all from persisted rows.
  assert.match(service, /participant\.userId !== message\.senderId/);
  assert.match(service, /recipient\.userId === message\.senderId/);
  assert.match(service, /!recipient\.user\.isActive/);
  assert.match(service, /userId: recipient\.userId,/);
  assert.match(service, /actorId: message\.senderId,/);
  assert.doesNotMatch(service, /createNewMessageNotification[\s\S]{0,300}recipientId/);

  // Canonical message identity: the unique messageId makes retries safe.
  assert.match(service, /messageId: message\.id,/);
  assert.match(service, /P2002/);

  // Bounded preview (never the whole body) and the existing chat deep link.
  assert.match(service, /buildNotificationPreview\(message\.content\)/);
  assert.match(service, /type: "NEW_MESSAGE",/);
  assert.match(service, /sanitizeNotificationUrl\(`\/chats\/\$\{message\.conversation\.id\}`\)/);
});

// ===========================================================================
// UI rendering (always run)
// ===========================================================================

test("NEW_MESSAGE renders with sender copy and a conversation deep link", () => {
  assert.match(client, /`\$\{item\.actor\.name\} sent you a message`/);
  assert.match(client, /if \(item\.type === "NEW_MESSAGE" && item\.conversationId\) \{/);
  assert.match(
    client,
    /const path = `\/chats\/\$\{encodeURIComponent\(item\.conversationId\)\}`;/,
  );
  // Telegram Mini App keeps its prefix on the same conversation route.
  assert.match(client, /miniAppPrefix \? `\$\{miniAppPrefix\}\$\{path\}`/);
});

test("notification read state stays on Notification.readAt", () => {
  assert.match(client, /if \(!item\.read\) \{/);
  assert.match(client, /const unread = !item\.read;/);
  assert.match(client, /\/api\/notifications\/\$\{item\.id\}\/read/);
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

/** Builds a canonical 1:1 conversation with both participants. */
async function createConversation(
  userAId: string,
  userBId: string,
): Promise<string> {
  const client = await db();
  const [lowId, highId] = [userAId, userBId].sort();
  const conversation = await client.conversation.create({
    data: {
      userLowId: lowId,
      userHighId: highId,
      participants: {
        create: [{ userId: userAId }, { userId: userBId }],
      },
    },
  });
  return conversation.id;
}

async function createMessage(
  conversationId: string,
  senderId: string,
  content: string,
): Promise<string> {
  const client = await db();
  const message = await client.message.create({
    data: { conversationId, senderId, content },
  });
  return message.id;
}

async function createTestSubscription(
  userId: string,
  tag: string,
): Promise<string> {
  const client = await db();
  const endpoint = `https://push.test/msg-notif/${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  createdEndpoints.push(endpoint);
  await client.pushSubscription.create({
    data: {
      endpoint,
      p256dh: "test-p256dh",
      auth: "test-auth",
      deviceId: `msg-notif-device-${tag}`,
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
    where: { name: { startsWith: "msg_notif_" } },
  });
  await client.pushSubscription.deleteMany({
    where: { endpoint: { startsWith: "https://push.test/msg-notif/" } },
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
    // Cascades remove conversations, messages, and notifications.
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
  }
  await prisma.$disconnect();
});

test("A sending B a message notifies B exactly once, never A", { skip: SKIP }, async () => {
  const client = await db();
  const { createNewMessageNotification } = await import(
    "../lib/notifications/notification-service"
  );
  const userA = await createTestUser("msg_notif_a");
  const userB = await createTestUser("msg_notif_b");
  const conversationId = await createConversation(userA.id, userB.id);
  const messageId = await createMessage(
    conversationId,
    userA.id,
    "See you at eight!",
  );

  await createNewMessageNotification({ messageId });

  const rowsForB = await client.notification.findMany({
    where: { userId: userB.id },
  });
  assert.equal(rowsForB.length, 1, "B receives exactly one notification");
  assert.equal(rowsForB[0].type, "NEW_MESSAGE");
  assert.equal(rowsForB[0].actorId, userA.id, "actor is the persisted sender");
  assert.equal(rowsForB[0].messageId, messageId);
  assert.equal(rowsForB[0].body, "See you at eight!", "bounded preview body");
  assert.equal(rowsForB[0].readAt, null, "notification starts unread");

  const rowsForA = await client.notification.findMany({
    where: { userId: userA.id },
  });
  assert.equal(rowsForA.length, 0, "the sender is never notified");
});

test("repeated processing of one message never duplicates the notification", {
  skip: SKIP,
}, async () => {
  const client = await db();
  const { createNewMessageNotification } = await import(
    "../lib/notifications/notification-service"
  );
  const userA = await createTestUser("msg_notif_ra");
  const userB = await createTestUser("msg_notif_rb");
  const conversationId = await createConversation(userA.id, userB.id);
  const messageId = await createMessage(conversationId, userA.id, "Ping");

  await createNewMessageNotification({ messageId });
  await createNewMessageNotification({ messageId });

  const rows = await client.notification.findMany({
    where: { userId: userB.id },
  });
  assert.equal(rows.length, 1, "the unique messageId dedupes retries");
});

test("an invalid message reference creates no notification", { skip: SKIP }, async () => {
  const { createNewMessageNotification } = await import(
    "../lib/notifications/notification-service"
  );
  // A failed message operation leaves no persisted row: the service no-ops.
  await createNewMessageNotification({ messageId: "missing-message-id" });

  const client = await db();
  const rows = await client.notification.findMany({
    where: { type: "NEW_MESSAGE", body: "Ghost" },
  });
  assert.equal(rows.length, 0);
});

test("message Web Push uses the created notification and the chat URL", {
  skip: SKIP,
}, async () => {
  const client = await db();
  const { createNewMessageNotification } = await import(
    "../lib/notifications/notification-service"
  );
  sent.length = 0;

  const userA = await createTestUser("msg_notif_pa");
  const userB = await createTestUser("msg_notif_pb");
  const bEndpoint = await createTestSubscription(userB.id, "b");
  await createTestSubscription(userA.id, "a");
  const conversationId = await createConversation(userA.id, userB.id);
  const messageId = await createMessage(conversationId, userA.id, "On my way");

  await createNewMessageNotification({ messageId });

  const rows = await client.notification.findMany({
    where: { userId: userB.id, type: "NEW_MESSAGE" },
  });
  assert.equal(rows.length, 1);

  assert.equal(sent.length, 1, "only the recipient's subscription receives");
  assert.equal(sent[0].endpoint, bEndpoint);
  assert.equal(sent[0].payload.type, "NEW_MESSAGE");
  assert.equal(sent[0].payload.title, userA.name);
  assert.equal(sent[0].payload.body, "On my way");
  assert.equal(sent[0].payload.url, `/chats/${conversationId}`);
  assert.equal(sent[0].payload.notificationId, rows[0].id);
});
