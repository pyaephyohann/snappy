/**
 * Social S8 — Production polish architecture tests (static assertions).
 * Run: node --import tsx --test scripts/social-s8.test.ts
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

// ── 1. Next.js security patch ────────────────────────────────────

test("Next.js is pinned to the patched version", () => {
  const pkg = JSON.parse(read("package.json")) as {
    dependencies: Record<string, string>;
  };
  assert.equal(pkg.dependencies.next, "16.3.6");
});

// ── 2. Inactive-user authorization hardening ─────────────────────

test("session-user resolution requires an active user", () => {
  const source = read("lib/session-user.ts");
  assert.match(source, /where: \{ id: session\.userId, isActive: true \}/);
  assert.match(source, /where: \{ name: session\.username, isActive: true \}/);
  assert.doesNotMatch(source, /findUnique/);
});

test("session resolver mirrors the active-user rule used by chat routes", () => {
  assert.match(read("lib/auth.ts"), /where: \{ id: session\.userId, isActive: true \}/);
  assert.match(
    read("app/api/notifications/route.ts"),
    /getAuthenticatedAppUser|resolveUserFromSession/,
  );
});

// ── 3. Chat unread-count N+1 removal ─────────────────────────────

test("chat list no longer counts unread messages per conversation", () => {
  const route = read("app/api/chats/route.ts");
  assert.match(route, /getUnreadCountsForConversations/);
  assert.doesNotMatch(route, /prisma\.message\.count/);
  assert.doesNotMatch(route, /viewerParticipant[\s\S]{0,200}count\(/);
  // Existing server-authoritative behaviors must remain.
  assert.match(route, /canMessage:/);
  assert.match(route, /friendshipMap\.get/);
  assert.match(route, /serializePresence/);
});

test("unread counts come from one grouped aggregate with identical semantics", () => {
  const chat = read("lib/chat.ts");
  assert.match(chat, /export async function getUnreadCountsForConversations/);
  assert.match(chat, /GROUP BY m\."conversationId"/);
  assert.match(chat, /Prisma\.join\(conversationIds\)/);
  assert.match(
    chat,
    /p\."lastReadAt" IS NULL OR m\."createdAt" > p\."lastReadAt"/,
  );
  assert.match(chat, /m\."senderId" <> \$\{viewerId\}/);
  assert.match(chat, /Number\(row\.count\)/);
});

// ── 4. Reaction concurrency ──────────────────────────────────────

test("reaction toggling is idempotent instead of read-then-write", () => {
  const lib = read("lib/message-reactions.ts");
  assert.match(lib, /messageReaction\.upsert/);
  assert.match(lib, /messageReaction\.deleteMany/);
  assert.match(lib, /P2002/);
  assert.match(lib, /P2025/);
  // The racy delete-then-create sequence is gone.
  assert.doesNotMatch(lib, /messageReaction\.delete\(\{ where: \{ id: existing\.id \} \}\)/);
  assert.doesNotMatch(lib, /messageReaction\.create\(\{/);
});

test("reaction contracts and responses are preserved", () => {
  const lib = read("lib/message-reactions.ts");
  assert.match(lib, /export async function toggleReaction/);
  assert.match(lib, /export async function getReactionsForMessages/);
  assert.match(lib, /export class ReactionError/);
  assert.match(lib, /getConversationAccess/);
  assert.match(lib, /verifyMessageAccess/);
  assert.match(lib, /return \{ action: "created"/);
  assert.match(lib, /return \{ action: "removed"/);
  assert.match(lib, /return \{ action: "replaced"/);
});

// ── 5. Unicode-safe notification previews ────────────────────────

test("notification previews are truncated by code point", () => {
  const service = read("lib/notifications/notification-service.ts");
  assert.match(service, /MAX_NOTIFICATION_PREVIEW_CODE_POINTS = 160/);
  assert.match(service, /export function buildNotificationPreview/);
  assert.match(
    service,
    /\.\.\.content\.trim\(\)\]\.slice\(0, MAX_NOTIFICATION_PREVIEW_CODE_POINTS\)\.join\(""\)/,
  );
  assert.doesNotMatch(service, /content\.trim\(\)\.slice\(0, 160\)/);
  // S6 guarantees stay intact.
  assert.match(service, /messageId: message\.id/);
  assert.match(service, /!recipient\.user\.isActive/);
});

// ── 6. User-list pagination ──────────────────────────────────────

test("active-user listing is keyset paginated and searchable", () => {
  const relationships = read("lib/relationships.ts");
  assert.match(relationships, /USER_LIST_PAGE_SIZE = 50/);
  assert.match(relationships, /export async function listUsersForViewerPage/);
  assert.match(relationships, /encodeUserListCursor/);
  assert.match(relationships, /orderBy: \[\{ name: "asc" \}, \{ id: "asc" \}\]/);
  assert.match(relationships, /name: \{ contains: trimmedQuery, mode: "insensitive" as const \}/);
  assert.ok(
    (relationships.match(/take: pageSize \+ 1/g) ?? []).length >= 2,
    "keyset take: pageSize + 1 in both paginated helpers",
  );
  assert.doesNotMatch(relationships, /skip:/);
});

test("users list API exposes a cursor without breaking the array contract", () => {
  const route = read("app/api/users/list/route.ts");
  assert.match(route, /searchParams\.get\("cursor"\)/);
  assert.match(route, /searchParams\.get\("query"\)/);
  assert.match(route, /USER_LIST_NEXT_CURSOR_HEADER/);
  assert.match(route, /NextResponse\.json\(page\.users\)/);
  assert.match(route, /listUsersForViewerPage/);
  assert.match(read("lib/user-list.ts"), /USER_LIST_NEXT_CURSOR_HEADER = "X-Next-Cursor"/);
});

test("home keeps its friend cap and reads a bounded page", () => {
  const home = read("lib/home-data.ts");
  assert.match(home, /HOME_FRIENDS_LIMIT = 50/);
  assert.match(home, /slice\(0, HOME_FRIENDS_LIMIT\)/);
  assert.match(home, /listUsersForViewer\(userId/);
});

test("bot friend lookups are bounded and validated by targeted lookup", () => {
  const friends = read("lib/snappy-friends.ts");
  assert.match(friends, /SNAPPY_FRIENDS_PAGE_SIZE = 50/);
  assert.match(friends, /name: \{ contains: query, mode: "insensitive" as const \}/);
  assert.match(friends, /export async function getSnappyFriendTarget/);
  assert.match(friends, /export async function isSnappyFriendTarget/);
  const take = friends.match(/take: limit/g) ?? [];
  assert.ok(take.length >= 1, "bounded take");

  const upload = read("lib/telegram/upload-snap.ts");
  assert.match(upload, /getSnappyFriendTarget/);
  assert.match(upload, /isSnappyFriendTarget/);
  assert.match(upload, /listSnappyFriendsForUser\(linked\.userId\)/);
  assert.doesNotMatch(upload, /\.some\(\(friend\) => friend\.id === targetUserId\)/);

  const findFriends = read("lib/telegram/find-friends.ts");
  assert.match(findFriends, /listSnappyFriendsForUser\(linked\.userId, \{ query: text \}\)/);
});

test("user-list clients load further pages", () => {
  const panel = read("components/friends/FriendsPickerPanel.tsx");
  assert.match(panel, /hasMore/);
  assert.match(panel, /onLoadMore/);
  assert.match(panel, /Load more/);

  assert.match(read("components/search/FriendsSearchClient.tsx"), /nextCursor/);
  assert.match(read("app/search/page.tsx"), /listUsersForViewerPage/);
  assert.match(read("components/mobile/BottomNavCameraFlow.tsx"), /readNextUserListCursor/);
  assert.match(read("components/telegram/TelegramMiniAppSearch.tsx"), /readNextUserListCursor/);
  assert.match(read("components/telegram/TelegramMiniAppSearch.tsx"), /api\/users\/list/);
  assert.match(read("components/layout/NavbarDesktopFriendSearch.tsx"), /api\/users\/list/);
});

// ── 7. Deployment configuration ──────────────────────────────────

test("DIRECT_URL is documented for migration deploys", () => {
  assert.match(read(".env.example"), /DIRECT_URL/);
  assert.match(read("docs/telegram.md"), /`DIRECT_URL`/);
  assert.match(read("docs/telegram-release-checklist.md"), /DIRECT_URL/);
  assert.match(read("docs/social.md"), /DIRECT_URL/);
  assert.match(read("prisma/schema.prisma"), /directUrl = env\("DIRECT_URL"\)/);
});

// ── 8. Integration test wiring ───────────────────────────────────

test("S8 test suites are registered", () => {
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  assert.match(pkg.scripts["test:social-s8"] ?? "", /scripts\/social-s8\.test\.ts/);
  assert.match(
    pkg.scripts["test:social-integration"] ?? "",
    /scripts\/social-integration\.test\.ts/,
  );
  const integration = read("scripts/social-integration.test.ts");
  assert.match(integration, /DATABASE_URL/);
  assert.doesNotMatch(integration, /deleteMany\(\{\}\)/);
  assert.doesNotMatch(integration, /db push|migrate reset/);
});

// ── Preserved invariants ─────────────────────────────────────────

test("S8 adds no migration and leaves S7 thresholds untouched", () => {
  const migrations = readdirSync(resolve(root, "prisma/migrations"))
    .filter((entry) => entry !== "migration_lock.toml")
    .sort();
  assert.equal(
    migrations[migrations.length - 1],
    "20260924120000_social_user_presence",
  );

  const presence = read("lib/presence.ts");
  assert.match(presence, /ONLINE_WINDOW_MS = 60_000/);
  assert.match(presence, /HEARTBEAT_INTERVAL_MS = 30_000/);
  assert.match(presence, /HEARTBEAT_MIN_WRITE_INTERVAL_MS = 15_000/);
  assert.match(read("app/api/presence/route.ts"), /updateMany/);
});

test("S8 introduces no realtime transport, Redis, or offset pagination", () => {
  const files = [
    read("app/api/chats/route.ts"),
    read("lib/chat.ts"),
    read("lib/relationships.ts"),
    read("lib/user-list.ts"),
    read("app/api/users/list/route.ts"),
    read("lib/message-reactions.ts"),
    read("lib/notifications/notification-service.ts"),
  ].join("\n");
  assert.doesNotMatch(
    files,
    /\b(WebSocket|EventSource|socket\.io|pusher|ably|redis|upstash)\b/i,
  );
});

test("service worker cache version is bumped for the API contract change", () => {
  assert.match(read("public/sw.js"), /CACHE_VERSION = "snappy-pwa-v4"/);
});

// ── Documentation ────────────────────────────────────────────────

test("S8 documentation marks the hardening implemented", () => {
  const social = read("docs/social.md");
  assert.match(social, /S8 — Production Polish — Implemented/);
  assert.match(social, /X-Next-Cursor/);
  assert.match(social, /test:social-integration/);
  assert.match(social, /16\.3\.6/);
  assert.match(social, /Deferred \(explicitly out of scope\)/);
  assert.match(read("docs/notifications.md"), /160 Unicode code points/);
});
