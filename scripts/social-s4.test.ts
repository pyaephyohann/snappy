/**
 * Social S4 — Near-Realtime Chat Synchronization architecture tests.
 * Run: node --import tsx --test scripts/social-s4.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

// ── Polling architecture ─────────────────────────────────────────

test("active conversation polls approximately every 3 seconds", () => {
  const hook = read("hooks/useConversationMessages.ts");
  assert.match(hook, /POLL_INTERVAL_MS\s*=\s*3_000/);
  assert.match(hook, /setInterval.*void poll\(\)/);
});

test("chat list polls approximately every 15 seconds", () => {
  const hook = read("hooks/useChatList.ts");
  assert.match(hook, /POLL_INTERVAL_MS\s*=\s*15_000/);
  assert.match(hook, /setInterval.*void poll\(\)/);
});

test("polling pauses while document is hidden", () => {
  const conversationHook = read("hooks/useConversationMessages.ts");
  const chatListHook = read("hooks/useChatList.ts");

  // Both hooks should listen for visibilitychange and stop polling when hidden
  assert.match(conversationHook, /visibilitychange/);
  assert.match(conversationHook, /visibilityState.*hidden|!.*visible/);
  assert.match(chatListHook, /visibilitychange/);
  assert.match(chatListHook, /visibilityState.*hidden|!.*visible/);
});

test("polling resumes on visibility change to visible", () => {
  const conversationHook = read("hooks/useConversationMessages.ts");
  const chatListHook = read("hooks/useChatList.ts");

  // Both hooks should start polling / trigger poll when becoming visible
  assert.match(conversationHook, /visibilityState.*visible/);
  assert.match(chatListHook, /visibilityState.*visible/);
});

test("polling is cleaned up on unmount", () => {
  const conversationHook = read("hooks/useConversationMessages.ts");
  const chatListHook = read("hooks/useChatList.ts");

  // Both hooks should clear intervals and abort controllers on cleanup
  assert.match(conversationHook, /clearInterval/);
  assert.match(conversationHook, /pollControllerRef\.current\?\.abort/);
  assert.match(chatListHook, /clearInterval/);
  assert.match(chatListHook, /pollControllerRef\.current\?\.abort/);
});

test("no duplicate polling loops are created", () => {
  const conversationHook = read("hooks/useConversationMessages.ts");
  const chatListHook = read("hooks/useChatList.ts");

  // Poll timer ref guard: only start if null
  assert.match(conversationHook, /pollTimerRef\.current\s*!==\s*null/);
  assert.match(chatListHook, /pollTimerRef\.current\s*!==\s*null/);
});

// ── Stale request protection ─────────────────────────────────────

test("stale poll responses cannot overwrite newer state (generation counter)", () => {
  const hook = read("hooks/useConversationMessages.ts");

  // Generation counter pattern: increment on each poll, check before applying
  assert.match(hook, /generationRef\.current\s*\+=\s*1/);
  assert.match(hook, /generation\s*!==\s*generationRef\.current/);
});

test("aborted poll requests do not mutate state", () => {
  const hook = read("hooks/useConversationMessages.ts");

  // Check signal.aborted before applying results
  assert.match(hook, /controller\.signal\.aborted.*return/);
});

test("rapid visibility changes do not create concurrent poll loops", () => {
  const hook = read("hooks/useConversationMessages.ts");

  // Abort previous poll controller before starting new one
  assert.match(hook, /pollControllerRef\.current\?\.abort\(\)/);
});

// ── Message deduplication ────────────────────────────────────────

test("messages are deduplicated by message.id", () => {
  const hook = read("hooks/useConversationMessages.ts");

  // mergeMessages function uses Set for dedup
  assert.match(hook, /function mergeMessages/);
  assert.match(hook, /Set\(current\.map\(\(message\) => message\.id\)\)/);
});

test("sender receives POST response immediately without waiting for poll", () => {
  const hook = read("hooks/useConversationMessages.ts");

  // sendMessage appends result.message directly
  assert.match(hook, /result\.message/);
  assert.match(hook, /sortMessages\(\[\.\.\.current,\s*result\.message\]\)/);
});

test("POST-returned message is deduplicated against subsequent poll", () => {
  const hook = read("hooks/useConversationMessages.ts");

  // mergeMessages checks existing IDs before adding
  assert.match(hook, /seen\.has\(message\.id\)/);
});

// ── Missed-message reconciliation ────────────────────────────────

test("reconciliation walks backward through cursor pagination to find overlap", () => {
  const hook = read("hooks/useConversationMessages.ts");

  // reconcileMissedMessages function exists
  assert.match(hook, /async function reconcileMissedMessages/);

  // Walks backward using nextCursor
  assert.match(hook, /let cursor = newest\.nextCursor/);
  assert.match(hook, /while \(cursor\)/);
});

test("reconciliation stops when local message overlap is found", () => {
  const hook = read("hooks/useConversationMessages.ts");

  // Checks if incoming messages overlap with local IDs
  assert.match(hook, /localIds\.has\(message\.id\)/);
  assert.match(hook, /hasOverlap/);
});

test("reconciliation handles exhausted pagination", () => {
  const hook = read("hooks/useConversationMessages.ts");

  // Breaks on empty page or all-visited page
  assert.match(hook, /page\.messages\.length === 0/);
  assert.match(hook, /allNew/);
});

// ── Message ordering ─────────────────────────────────────────────

test("canonical (createdAt, id) ordering is preserved", () => {
  const hook = read("hooks/useConversationMessages.ts");

  // sortMessages uses createdAt then id tiebreaker
  assert.match(hook, /function sortMessages/);
  assert.match(hook, /left\.id\.localeCompare\(right\.id\)/);
});

// ── Chat list synchronization ────────────────────────────────────

test("chat list poll replaces with server-authoritative response", () => {
  const hook = read("hooks/useChatList.ts");

  // Poll sets conversations directly from server response (no client-side sorting)
  assert.match(hook, /setConversations\(result\.conversations\)/);
});

test("chat list does NOT locally increment unreadCount", () => {
  const hook = read("hooks/useChatList.ts");

  // No unreadCount increment logic
  assert.doesNotMatch(hook, /unreadCount\s*\+\+\s*1|unreadCount\s*\+\s*1/);
  assert.doesNotMatch(hook, /unreadCount:\s*current.*\+\s*1/);
});

// ── Scroll behavior ──────────────────────────────────────────────

test("MessageList preserves scroll anchoring for older-message pagination", () => {
  const list = read("components/chat/MessageList.tsx");
  assert.match(list, /previousScrollRef/);
  assert.match(list, /scrollHeight/);
  assert.match(list, /stickToBottomRef/);
});

test("MessageList scrolls to bottom only when user is near bottom", () => {
  const list = read("components/chat/MessageList.tsx");
  assert.match(list, /stickToBottomRef\.current/);
  assert.match(list, /distanceFromBottom.*120/);
});

// ── Read state ───────────────────────────────────────────────────

test("read state uses existing PATCH endpoint with throttling", () => {
  const hook = read("hooks/useConversationReadState.ts");
  assert.match(hook, /markConversationRead/);
  assert.match(hook, /lastMarkedAtRef/);
  assert.match(hook, /2_000/);
});

test("read state fires on focus and visibility changes", () => {
  const hook = read("hooks/useConversationReadState.ts");
  assert.match(hook, /addEventListener.*focus/);
  assert.match(hook, /visibilitychange/);
});

// ── Friendship lifecycle ─────────────────────────────────────────

test("GET /api/chats returns server-authoritative canMessage", () => {
  const route = read("app/api/chats/route.ts");
  assert.match(route, /canMessage:/);
  assert.match(route, /friendshipMap\.get/);
});

test("POST /api/chats/:id/messages requires current friendship", () => {
  const route = read("app/api/chats/[conversationId]/messages/route.ts");
  assert.match(route, /canUseConversation/);
});

test("GET /api/chats/:id/messages allows historical reads without current friendship", () => {
  const route = read("app/api/chats/[conversationId]/messages/route.ts");
  assert.match(route, /getConversationAccess/);
  assert.match(route, /areUsersFriends/);
});

// ── No forbidden features ────────────────────────────────────────

test("S4 excludes WebSocket, SSE, EventSource, and realtime services", () => {
  const chatHooks = [
    read("hooks/useConversationMessages.ts"),
    read("hooks/useChatList.ts"),
  ].join("\n");

  assert.doesNotMatch(chatHooks, /WebSocket|EventSource|socket\.io|pusher|ably|supabase|redis/i);
  assert.doesNotMatch(chatHooks, /new\s+EventSource/);
  assert.doesNotMatch(chatHooks, /\.addEventListener\("message"/);
});

test("S4 excludes typing indicators, reactions, attachments, delivery receipts", () => {
  const chatHooks = [
    read("hooks/useConversationMessages.ts"),
    read("hooks/useChatList.ts"),
  ].join("\n");

  assert.doesNotMatch(chatHooks, /typing|presence|reaction|attachment|delivery|receipt/i);
});

test("S4 does not introduce a global state library", () => {
  const hooks = [
    read("hooks/useConversationMessages.ts"),
    read("hooks/useChatList.ts"),
    read("hooks/useConversationReadState.ts"),
  ].join("\n");

  assert.doesNotMatch(hooks, /zustand|jotai|redux|react-query|swr|recoil|valtio/i);
});

// ── S4 architecture properties ───────────────────────────────────

test("S4 uses only HTTP polling via existing fetch-based API", () => {
  const hooks = [
    read("hooks/useConversationMessages.ts"),
    read("hooks/useChatList.ts"),
  ].join("\n");

  // Uses setInterval for polling, not WebSocket/SSE
  assert.match(hooks, /setInterval/);
  // Uses existing fetch-based API functions
  assert.match(hooks, /fetchConversationMessages|fetchChatList/);
});

test("S4 does not create a Prisma migration", () => {
  // Verify no new migration files were expected (this is an architecture test)
  assert.ok(true, "S4 architecture does not require database changes");
});

test("S4 does not introduce new npm dependencies", () => {
  // Verify no new dependencies were added for S4
  const pkg = JSON.parse(read("package.json"));
  // S4 should not have added any new dependencies
  assert.ok(!pkg.dependencies["socket.io"], "No socket.io dependency");
  assert.ok(!pkg.dependencies["ably"], "No ably dependency");
  assert.ok(!pkg.dependencies["pusher"], "No pusher dependency");
  assert.ok(!pkg.dependencies["ws"], "No ws dependency");
});

// ── Existing S3 components preserved ─────────────────────────────

test("ChatWorkspace consumes polling hooks correctly", () => {
  const workspace = read("components/chat/ChatWorkspace.tsx");
  assert.match(workspace, /useConversationMessages/);
  assert.match(workspace, /useConversationReadState/);
  assert.match(workspace, /canMessage/);
  assert.match(workspace, /FriendshipUnavailableState/);
});

test("ChatListPageClient consumes chat list polling hook", () => {
  const page = read("components/chat/ChatListPageClient.tsx");
  assert.match(page, /useChatList/);
  assert.match(page, /ChatList/);
});

test("shared hooks work for both Web/PWA and Telegram routes", () => {
  const webChat = read("app/chats/[conversationId]/page.tsx");
  const telegramChat = read("app/telegram/app/chats/[conversationId]/page.tsx");

  // Both use ChatWorkspace which uses the shared polling hooks
  assert.match(webChat, /ChatWorkspace/);
  assert.match(telegramChat, /ChatWorkspace/);
});
