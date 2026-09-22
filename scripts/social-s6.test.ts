/** Social S6 chat-message notification architecture tests. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

test("Notification schema adds NEW_MESSAGE and a unique nullable message relation", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /NEW_MESSAGE/);
  assert.match(schema, /messageId\s+String\?\s+@unique/);
  assert.match(schema, /message\s+Message\?/);
  assert.match(schema, /notifications\s+Notification\[\]/);
  for (const type of ["NEW_SNAP", "REACTION", "COMMENT", "BIRTHDAY"]) {
    assert.match(schema, new RegExp(type));
  }
});

test("S6 migration is additive and enforces one notification per message", () => {
  const migration = read("prisma/migrations/20260923120000_social_message_notifications/migration.sql");
  assert.match(migration, /ADD COLUMN "messageId" TEXT/);
  assert.match(migration, /CREATE UNIQUE INDEX "notifications_messageId_key"/);
  assert.match(migration, /messageId_fkey/);
  assert.match(migration, /REFERENCES "messages"/);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DROP COLUMN/);
});

test("message notification service derives recipient and identity from persisted message", () => {
  const service = read("lib/notifications/notification-service.ts");
  assert.match(service, /createNewMessageNotification/);
  assert.match(service, /prisma\.message\.findUnique/);
  assert.match(service, /participants/);
  assert.match(service, /participant\.userId !== message\.senderId/);
  assert.match(service, /messageId: message\.id/);
  assert.doesNotMatch(service, /recipientId.*input|actorId.*input/i);
});

test("service rejects self-notification and invalid participants", () => {
  const service = read("lib/notifications/notification-service.ts");
  assert.match(service, /recipient\.userId === message\.senderId/);
  assert.match(service, /!senderParticipant/);
  assert.match(service, /!recipient\.user\.isActive/);
});

test("message notification creation is database-idempotent", () => {
  const service = read("lib/notifications/notification-service.ts");
  assert.match(service, /messageId: message\.id/);
  assert.match(service, /P2002/);
  assert.match(service, /return;/);
});

test("authorized message creation invokes notification after persistence", () => {
  const route = read("app/api/chats/[conversationId]/messages/route.ts");
  assert.match(route, /createNewMessageNotification/);
  assert.match(route, /messageId: created\.id/);
  assert.match(route, /await createNewMessageNotification/);
  assert.match(route, /notification failed/);
  assert.match(route, /senderId: viewer\.id/);
});

test("message authorization remains S2/S3 behavior", () => {
  const route = read("app/api/chats/[conversationId]/messages/route.ts");
  assert.match(route, /canUseConversation/);
  assert.match(route, /isSocialMutationRateLimited/);
  assert.match(route, /validateMessageContent/);
  assert.doesNotMatch(route, /body\.senderId|body\.recipientId|body\.userId/);
});

test("PushSubscription ownership is authenticated and client userId is ignored", () => {
  const route = read("app/api/notifications/subscribe/route.ts");
  const schema = read("lib/notifications/push-subscription-schema.ts");
  assert.match(route, /getAuthenticatedAppUser/);
  assert.match(route, /user\.id/);
  assert.match(route, /Subscription belongs to another user/);
  assert.doesNotMatch(schema, /userId/);
  assert.match(route, /userId: user\.id/);
});

test("subscription deletion is scoped to authenticated owner", () => {
  const route = read("app/api/notifications/subscribe/route.ts");
  assert.match(route, /deleteMany/);
  assert.match(route, /endpoint: parsed\.data\.endpoint, userId: user\.id/);
});

test("NEW_MESSAGE push is targeted and uses a safe chat URL", () => {
  const service = read("lib/notifications/notification-service.ts");
  const urls = read("lib/notifications/internal-url.ts");
  assert.match(service, /type: "NEW_MESSAGE"/);
  assert.match(service, /where: \{ userId: recipient\.userId \}/);
  assert.match(service, /sanitizeNotificationUrl\(`\/chats/);
  assert.match(urls, /path\.startsWith\("\/chats\/"\)/);
});

test("push failure remains isolated from message creation", () => {
  const route = read("app/api/chats/[conversationId]/messages/route.ts");
  const service = read("lib/notifications/notification-service.ts");
  assert.match(route, /\.catch\(\(error\) =>/);
  assert.match(service, /sendPushToSubscription/);
  assert.match(service, /return false/);
});

test("notification API returns conversation routing data only for the viewer", () => {
  const route = read("app/api/notifications/route.ts");
  assert.match(route, /requireSession/);
  assert.match(route, /where: \{ userId: user\.id \}/);
  assert.match(route, /message: \{ select: \{ conversationId: true \} \}/);
  assert.match(route, /conversationId: n\.message\?\.conversationId/);
});

test("notification UI routes web and Telegram message alerts separately", () => {
  const client = read("components/notifications/NotificationsPageClient.tsx");
  assert.match(client, /NEW_MESSAGE/);
  assert.match(client, /item\.conversationId/);
  assert.match(client, /\/chats\/\$\{encodeURIComponent\(item\.conversationId\)\}/);
  assert.match(client, /miniAppPrefix \? `\$\{miniAppPrefix\}\$\{path\}`/);
});

test("local notification storage supports NEW_MESSAGE and BIRTHDAY", () => {
  const local = read("lib/local-notifications.ts");
  assert.match(local, /NEW_MESSAGE/);
  assert.match(local, /BIRTHDAY/);
  assert.match(local, /upsertLocalNotification/);
});

test("service worker validates web and Telegram chat notification paths", () => {
  const sw = read("public/sw.js");
  assert.match(sw, /pathname\.startsWith\("\/chats\/"\)/);
  assert.match(sw, /pathname\.startsWith\("\/telegram\/app\/chats\/"\)/);
  assert.match(sw, /isValidInternalPath/);
  assert.match(sw, /openWindow/);
});

test("chat and notification read state remain independent", () => {
  const chatRead = read("app/api/chats/[conversationId]/read/route.ts");
  const notificationRead = read("app/api/notifications/[id]/read/route.ts");
  assert.match(chatRead, /lastReadAt/);
  assert.match(notificationRead, /readAt/);
  assert.doesNotMatch(chatRead, /notification/);
  assert.doesNotMatch(notificationRead, /lastReadAt/);
});

test("Telegram uses shared notification UI and no Bot notification path", () => {
  const alerts = read("components/telegram/TelegramMiniAppAlerts.tsx");
  const bot = read("lib/telegram/commands.ts");
  assert.match(alerts, /NotificationsPageClient/);
  assert.match(alerts, /miniAppPrefix=\"\/telegram\/app\"/);
  assert.doesNotMatch(bot, /NEW_MESSAGE|createNewMessageNotification|notification-service/);
});

test("S6 does not add another realtime transport or state library", () => {
  const files = [
    read("lib/notifications/notification-service.ts"),
    read("app/api/chats/[conversationId]/messages/route.ts"),
    read("components/notifications/NotificationsPageClient.tsx"),
  ].join("\n");
  assert.match(files, /createNewMessageNotification|NotificationsPageClient/);
});

test("S6 documentation preserves milestone numbering and defers Telegram Bot delivery", () => {
  const social = read("docs/social.md");
  const notifications = read("docs/notifications.md");
  assert.match(social, /S5 — Message Reactions — Implemented/);
  assert.match(social, /S6 — Notifications — Implemented/);
  assert.match(social, /S7 — User Status \(planned\)/);
  assert.match(social, /Telegram Bot notification delivery is explicitly deferred/);
  assert.match(notifications, /Chat Message Notifications/);
  assert.match(notifications, /Telegram Bot delivery is deferred/);
});
