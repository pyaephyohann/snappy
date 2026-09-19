/**
 * Social S3 chat UI architecture and route tests.
 * Run: node --import tsx --test scripts/social-s3.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

test("Web/PWA and Telegram chat routes are present", () => {
  assert.match(read("app/chats/layout.tsx"), /getAuthenticatedAppUser/);
  assert.match(read("app/chats/page.tsx"), /ChatListPageClient/);
  assert.match(read("app/chats/[conversationId]/page.tsx"), /ChatWorkspace/);
  assert.match(read("app/telegram/app/chats/page.tsx"), /ChatListPageClient/);
  assert.match(read("app/telegram/app/chats/[conversationId]/page.tsx"), /ChatWorkspace/);
  assert.match(read("lib/telegram/mini-app-routes.ts"), /chats:/);
});

test("chat list uses server canMessage and cursor pagination", () => {
  const api = read("app/api/chats/route.ts");
  const list = read("components/chat/ChatList.tsx");
  assert.match(api, /getMutualFriendshipMap/);
  assert.match(api, /canMessage:/);
  assert.match(list, /conversation\.canMessage/);
  assert.match(list, /IntersectionObserver/);
  assert.match(list, /Load more/);
  assert.doesNotMatch(list, /api\/users\/.*relationship/);
});

test("history reads require membership but not current friendship while sends still do", () => {
  const messages = read("app/api/chats/[conversationId]/messages/route.ts");
  assert.match(messages, /getConversationAccess/);
  assert.match(messages, /areUsersFriends/);
  assert.match(messages, /const access = await canUseConversation/);
  assert.match(messages, /canMessage/);
});

test("shared message UI supports chronological rendering and anchored older pagination", () => {
  const list = read("components/chat/MessageList.tsx");
  const hook = read("hooks/useConversationMessages.ts");
  assert.match(list, /whitespace-pre-wrap/);
  assert.match(list, /break-words/);
  assert.match(list, /scrollHeight/);
  assert.match(list, /previousScrollRef/);
  assert.match(hook, /Set\(current\.map\(\(message\) => message\.id\)\)/);
  assert.match(hook, /sortMessages/);
});

test("composer is text-only, Unicode-aware, and server-confirmed", () => {
  const composer = read("components/chat/MessageComposer.tsx");
  const hook = read("hooks/useConversationMessages.ts");
  assert.match(composer, /MAX_MESSAGE_CODE_POINTS/);
  assert.match(composer, /\[\.\.\.draft\]\.length/);
  assert.match(composer, /Shift|shiftKey/);
  assert.match(composer, /textarea/);
  assert.match(hook, /sendChatMessage/);
  assert.doesNotMatch(composer, /attachment|media|file/i);
});

test("read state and friendship-unavailable UX are wired", () => {
  const workspace = read("components/chat/ChatWorkspace.tsx");
  const readHook = read("hooks/useConversationReadState.ts");
  const unavailable = read("components/chat/FriendshipUnavailableState.tsx");
  assert.match(workspace, /useConversationReadState/);
  assert.match(workspace, /canMessage/);
  assert.match(workspace, /FriendshipUnavailableState/);
  assert.match(readHook, /markConversationRead/);
  assert.match(readHook, /visibilitychange/);
  assert.match(unavailable, /messaging requires mutual friendship/i);
});

test("active conversation hides navigation without changing camera behavior", () => {
  const webChrome = read("components/chat/ChatWebChrome.tsx");
  const telegramShell = read("components/telegram/TelegramMiniAppShell.tsx");
  assert.match(webChrome, /!isConversation \? <BottomNav/);
  assert.match(telegramShell, /!isChatConversationRoute \? <TelegramBottomNav/);
  assert.match(telegramShell, /TELEGRAM_MINI_APP_ROUTES\.chats/);
});

test("S3 excludes later realtime and message feature work", () => {
  const chatComponents = [
    read("components/chat/ChatWorkspace.tsx"),
    read("components/chat/MessageComposer.tsx"),
    read("lib/chat-client.ts"),
  ].join("\n");
  assert.doesNotMatch(chatComponents, /WebSocket|EventSource|setInterval|typing|presence|reaction|attachment|media/i);
});
