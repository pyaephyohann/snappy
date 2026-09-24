/**
 * Social S7 — User Status / Presence architecture tests.
 * Run: node --import tsx --test scripts/social-s7.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_MIN_WRITE_INTERVAL_MS,
  ONLINE_WINDOW_MS,
  formatLastSeen,
  isOnline,
  serializePresence,
} from "../lib/presence";

const root = resolve(import.meta.dirname, "..");
function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

const NOW = Date.UTC(2026, 8, 25, 12, 0, 0);
const at = (offsetMs: number) => new Date(NOW - offsetMs);

// ── Schema and migration ─────────────────────────────────────────

test("User gains a nullable lastSeenAt field and no stored isOnline boolean", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /lastSeenAt\s+DateTime\?/);
  assert.doesNotMatch(schema, /isOnline/);
  // The field must not be given a default or a database index.
  assert.doesNotMatch(schema, /lastSeenAt\s+DateTime\?\s+@default/);
  assert.doesNotMatch(schema, /@@index\(\[.*lastSeenAt/);
});

test("the S7 migration is additive and only adds the presence column", () => {
  const migration = read(
    "prisma/migrations/20260924120000_social_user_presence/migration.sql",
  );
  assert.match(migration, /ALTER TABLE "users" ADD COLUMN "lastSeenAt" TIMESTAMP\(3\)/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM|UPDATE "/i);
  // Exactly one column addition, no backfill.
  assert.equal(migration.match(/ADD COLUMN/g)?.length, 1);
});

test("existing notification and Spark migrations are untouched", () => {
  assert.match(
    read("prisma/migrations/20260923120000_social_message_notifications/migration.sql"),
    /"messageId"/,
  );
  assert.match(
    read("prisma/migrations/20260920160000_spark_economy_foundation/migration.sql"),
    /CREATE TABLE/,
  );
  assert.match(read("prisma/migrations/20260920170000_social_message_reactions/migration.sql"), /message_reactions/i);
});

// ── Presence semantics (pure functions, explicit clock) ──────────

test("presence thresholds are 60s online, 30s heartbeat, 15s write suppression", () => {
  assert.equal(ONLINE_WINDOW_MS, 60_000);
  assert.equal(HEARTBEAT_INTERVAL_MS, 30_000);
  assert.equal(HEARTBEAT_MIN_WRITE_INTERVAL_MS, 15_000);
  assert.ok(HEARTBEAT_INTERVAL_MS > HEARTBEAT_MIN_WRITE_INTERVAL_MS);
  assert.ok(ONLINE_WINDOW_MS > HEARTBEAT_INTERVAL_MS);
});

test("null lastSeenAt is offline", () => {
  assert.equal(isOnline(null, true, NOW), false);
  assert.equal(isOnline(undefined, true, NOW), false);
  assert.deepEqual(serializePresence({ lastSeenAt: null, isActive: true }, NOW), {
    isOnline: false,
    lastSeenAt: null,
  });
});

test("exactly 60 seconds is online and one millisecond older is offline", () => {
  assert.equal(isOnline(at(ONLINE_WINDOW_MS), true, NOW), true);
  assert.equal(isOnline(at(ONLINE_WINDOW_MS + 1), true, NOW), false);
  assert.equal(isOnline(at(0), true, NOW), true);
});

test("inactive users are always offline and expose no last-seen timestamp", () => {
  assert.equal(isOnline(at(1_000), false, NOW), false);
  assert.deepEqual(
    serializePresence({ lastSeenAt: at(1_000), isActive: false }, NOW),
    { isOnline: false, lastSeenAt: null },
  );
});

test("presence is derived from server time and serializes ISO timestamps", () => {
  const fresh = serializePresence({ lastSeenAt: at(1_000), isActive: true }, NOW);
  assert.equal(fresh.isOnline, true);
  assert.equal(fresh.lastSeenAt, at(1_000).toISOString());

  const stale = serializePresence({ lastSeenAt: at(90_000), isActive: true }, NOW);
  assert.equal(stale.isOnline, false);
  assert.equal(stale.lastSeenAt, at(90_000).toISOString());

  // Accepts the string form returned by the API layer.
  assert.equal(isOnline(at(1_000).toISOString(), true, NOW), true);
  assert.equal(isOnline("not-a-date", true, NOW), false);
});

test("last-seen labels are human readable and null without a timestamp", () => {
  assert.equal(formatLastSeen(null, NOW), null);
  assert.equal(formatLastSeen(at(10_000), NOW), "Last seen just now");
  assert.equal(formatLastSeen(at(5 * 60_000), NOW), "Last seen 5m ago");
  assert.equal(formatLastSeen(at(3 * 3_600_000), NOW), "Last seen 3h ago");
  assert.equal(formatLastSeen(at(26 * 3_600_000), NOW), "Last seen yesterday");
  assert.equal(formatLastSeen(at(3 * 86_400_000), NOW), "Last seen 3d ago");
});

// ── Heartbeat API ────────────────────────────────────────────────

test("PATCH /api/presence derives its target from the authenticated session", () => {
  const route = read("app/api/presence/route.ts");
  assert.match(route, /export async function PATCH/);
  assert.match(route, /getAuthenticatedAppUser/);
  assert.match(route, /viewer\.id/);
  assert.doesNotMatch(route, /body\.userId|body\.user\b|searchParams\.get\("userId"\)|params/);
  assert.doesNotMatch(route, /export async function GET/);
});

test("heartbeat writes are concurrency-safe conditional updates", () => {
  const route = read("app/api/presence/route.ts");
  assert.match(route, /updateMany/);
  assert.match(route, /OR: \[\{ lastSeenAt: null \}/);
  assert.match(route, /HEARTBEAT_MIN_WRITE_INTERVAL_MS/);
  assert.match(route, /lastSeenAt: \{ lt: writeThreshold \}/);
  // The conditional write decides suppression, so no read-then-write pattern.
  const writeIndex = route.indexOf("updateMany");
  assert.ok(writeIndex > -1, "conditional write present");
  for (const reader of ["findFirst", "findUnique"]) {
    const readerIndex = route.indexOf(reader);
    if (readerIndex > -1) assert.ok(writeIndex < readerIndex, `no ${reader} before the write`);
  }
});

test("heartbeat rejects unauthenticated and inactive users and unexpected payloads", () => {
  const route = read("app/api/presence/route.ts");
  assert.match(route, /status: 401/);
  assert.match(route, /isActive: true/);
  assert.match(route, /\.strict\(\)/);
  assert.match(route, /Unexpected presence payload/);
  assert.match(route, /status: 400/);
});

test("heartbeat reuses the existing social rate limiter", () => {
  const route = read("app/api/presence/route.ts");
  const limiter = read("lib/social-rate-limit.ts");
  assert.match(route, /isSocialMutationRateLimited/);
  assert.match(route, /status: 429/);
  assert.doesNotMatch(route, /new Map|setInterval/);
  assert.match(limiter, /isSocialMutationRateLimited/);
});

// ── Chat DTOs ────────────────────────────────────────────────────

test("chat list exposes server-derived presence for the other participant", () => {
  const route = read("app/api/chats/route.ts");
  assert.match(route, /serializePresence/);
  assert.match(route, /lastSeenAt: true/);
  assert.equal(route.match(/lastSeenAt: true/g)?.length, 3);
});

test("conversation messages expose presence without an extra per-message query", () => {
  const route = read("app/api/chats/[conversationId]/messages/route.ts");
  const chat = read("lib/chat.ts");
  assert.match(route, /serializePresence/);
  assert.match(route, /otherParticipant: \{/);
  assert.match(chat, /lastSeenAt: true/);
  assert.match(chat, /getConversationAccess/);
  // Presence rides the existing participant relation.
  assert.doesNotMatch(route, /user\.findUnique|user\.findMany|user\.findFirst/);
});

test("client participant type carries isOnline and lastSeenAt", () => {
  const client = read("lib/chat-client.ts");
  assert.match(client, /export type ChatParticipant = ChatParty & \{/);
  assert.match(client, /isOnline: boolean/);
  assert.match(client, /lastSeenAt: string \| null/);
});

// ── Heartbeat hook and architecture ──────────────────────────────

test("heartbeat hook is visibility-aware, deduplicated, and cleaned up", () => {
  const hook = read("hooks/usePresenceHeartbeat.ts");
  assert.match(hook, /HEARTBEAT_INTERVAL_MS/);
  assert.match(hook, /setInterval/);
  assert.match(hook, /clearInterval/);
  assert.match(hook, /visibilitychange/);
  assert.match(hook, /document\.visibilityState !== "visible"/);
  assert.match(hook, /AbortController/);
  assert.match(hook, /credentials: "include"/);
  assert.match(hook, /method: "PATCH"/);
  assert.match(hook, /inFlightRef/);
});

test("presence adds no polling loop and no new realtime transport", () => {
  const files = [
    read("hooks/usePresenceHeartbeat.ts"),
    read("components/presence/PresenceHeartbeat.tsx"),
    read("components/presence/PresenceIndicator.tsx"),
    read("lib/presence.ts"),
    read("app/api/presence/route.ts"),
  ].join("\n");
  assert.doesNotMatch(files, /WebSocket|EventSource|socket\.io|pusher|ably|supabase|redis/i);

  // Existing chat polling cadence is unchanged and does not heartbeat.
  const chatList = read("hooks/useChatList.ts");
  const messages = read("hooks/useConversationMessages.ts");
  assert.match(chatList, /POLL_INTERVAL_MS\s*=\s*15_000/);
  assert.match(messages, /POLL_INTERVAL_MS\s*=\s*3_000/);
  assert.doesNotMatch(chatList, /\/api\/presence/);
  assert.doesNotMatch(messages, /\/api\/presence/);

  // Presence reads come from the existing chat DTOs, not a presence GET.
  assert.doesNotMatch(read("app/api/presence/route.ts"), /export async function GET/);
});

test("PresenceHeartbeat renders nothing and is mounted once per authenticated chrome", () => {
  const component = read("components/presence/PresenceHeartbeat.tsx");
  assert.match(component, /usePresenceHeartbeat/);
  assert.match(component, /return null/);
  assert.match(read("components/layout/UserAppChrome.tsx"), /PresenceHeartbeat/);
  assert.match(read("components/chat/ChatWebChrome.tsx"), /PresenceHeartbeat/);
  assert.match(
    read("components/telegram/TelegramMiniAppLayoutClient.tsx"),
    /PresenceHeartbeat/,
  );
});

// ── UI ───────────────────────────────────────────────────────────

test("chat list shows an accessible presence badge", () => {
  const list = read("components/chat/ChatList.tsx");
  assert.match(list, /PresenceIndicator/);
  assert.match(list, /participant\.isOnline/);
  assert.match(list, /participant\.isOnline \? ", online" : ""/);
});

test("conversation header shows online or last-seen state", () => {
  const header = read("components/chat/ChatHeader.tsx");
  assert.match(header, /PresenceIndicator/);
  assert.match(header, /isOnline=\{participant\.isOnline\}/);
  assert.match(header, /lastSeenAt=\{participant\.lastSeenAt\}/);
  assert.match(header, /withLabel/);
});

test("presence indicator is not color-only and exposes accessible text", () => {
  const indicator = read("components/presence/PresenceIndicator.tsx");
  assert.match(indicator, /sr-only/);
  assert.match(indicator, /aria-hidden="true"/);
  assert.match(indicator, /return "Online"/);
  assert.match(indicator, /formatLastSeen/);
  assert.match(indicator, /"Offline"/);
  // Online and offline differ by shape as well as color.
  assert.match(indicator, /bg-emerald-500/);
  assert.match(indicator, /border border-muted-foreground\/50/);
});

// ── Telegram Mini App parity ─────────────────────────────────────

test("Telegram chats reuse the shared components and add no presence endpoint", () => {
  assert.match(read("app/telegram/app/chats/page.tsx"), /ChatListPageClient/);
  const conversation = read("app/telegram/app/chats/[conversationId]/page.tsx");
  assert.match(conversation, /ChatWorkspace/);
  assert.doesNotMatch(conversation, /presence/i);

  const miniAppApi = read("lib/telegram/mini-app-api.ts");
  assert.doesNotMatch(miniAppApi, /presence/i);
});

test("Telegram presence relies on server-side expiry, not unload hooks", () => {
  const files = [
    read("components/presence/PresenceHeartbeat.tsx"),
    read("hooks/usePresenceHeartbeat.ts"),
    read("components/telegram/TelegramMiniAppLayoutClient.tsx"),
  ].join("\n");
  assert.doesNotMatch(files, /beforeunload|sendBeacon|navigator\.sendBeacon/);
});

// ── Notifications remain untouched ───────────────────────────────

test("presence creates no notification type, record, or push", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /enum NotificationType \{\n  NEW_SNAP\n  NEW_MESSAGE\n  REACTION\n  COMMENT\n  BIRTHDAY\n\}/);
  assert.doesNotMatch(schema, /PRESENCE|ONLINE|LAST_SEEN/);

  const route = read("app/api/presence/route.ts");
  assert.doesNotMatch(route, /notification|PushSubscription|sendPush|web-push/i);

  const service = read("lib/notifications/notification-service.ts");
  assert.doesNotMatch(service, /presence|lastSeenAt/i);
});

// ── Documentation ────────────────────────────────────────────────

test("S7 documentation marks presence implemented and defers text status", () => {
  const social = read("docs/social.md");
  const notifications = read("docs/notifications.md");
  const telegram = read("docs/telegram.md");

  assert.match(social, /S7 — User Status — Implemented/);
  assert.match(social, /User\.lastSeenAt|`lastSeenAt`/);
  assert.match(social, /60_000|60 seconds/);
  assert.match(social, /deferred/i);
  assert.match(social, /S8 — Production Polish — Implemented/);
  assert.match(social, /S6 — Notifications — Implemented/);

  assert.match(notifications, /do not create notifications and do not send push notifications/);
  assert.match(notifications, /Telegram Bot delivery is deferred/);

  assert.match(telegram, /Presence \(S7\)/);
  assert.match(telegram, /no Telegram Bot presence implementation/i);
});
