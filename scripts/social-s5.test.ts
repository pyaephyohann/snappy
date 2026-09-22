/**
 * Social S5 — Message Reactions architecture and behavior tests.
 * Run: node --import tsx --test scripts/social-s5.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

// ── Schema ───────────────────────────────────────────────────────

test("MessageReaction model exists in Prisma schema", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model MessageReaction \{/);
});

test("MessageReaction has unique [userId, messageId] constraint", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /@@unique\(\[userId, messageId\]\)/);
});

test("MessageReaction has messageId index", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /@@index\(\[messageId\]\)/);
});

test("MessageReaction uses string type, not enum", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model MessageReaction \{[\s\S]*?type\s+String/);
  assert.doesNotMatch(schema, /model MessageReaction \{[\s\S]*?type\s+MessageReactionType/);
});

test("Message model has reactions relation", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model Message \{[\s\S]*?reactions\s+MessageReaction\[\]/);
});

test("User model has messageReactions relation", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model User \{[\s\S]*?messageReactions\s+MessageReaction\[\]/);
});

test("MessageReaction does not reuse Snap Reaction model", () => {
  const schema = read("prisma/schema.prisma");
  // Snap Reaction model uses snapId, not messageId
  assert.match(schema, /model Reaction \{[\s\S]*?snapId/);
  assert.match(schema, /model MessageReaction \{[\s\S]*?messageId/);
  // They are separate models
  assert.match(schema, /model Reaction \{/);
  assert.match(schema, /model MessageReaction \{/);
});

// ── Migration ────────────────────────────────────────────────────

test("Additive migration exists for message reactions", () => {
  const migration = read("prisma/migrations/20260920170000_social_message_reactions/migration.sql");
  assert.match(migration, /CREATE TABLE "message_reactions"/);
  assert.match(migration, /message_reactions_userId_messageId_key/);
  assert.match(migration, /message_reactions_messageId_idx/);
  assert.match(migration, /ON DELETE CASCADE/);
});

// ── Server logic ─────────────────────────────────────────────────

test("lib/message-reactions.ts exports core functions", () => {
  const lib = read("lib/message-reactions.ts");
  assert.match(lib, /export async function toggleReaction/);
  assert.match(lib, /export async function getReactionsForMessages/);
  assert.match(lib, /export class ReactionError/);
});

test("Reaction type validation enforces the six locked types", () => {
  const lib = read("lib/message-reactions.ts");
  assert.match(lib, /MESSAGE_REACTION_TYPES/);
  assert.match(lib, /❤️/);
  assert.match(lib, /😂/);
  assert.match(lib, /😮/);
  assert.match(lib, /😢/);
  assert.match(lib, /👍/);
  assert.match(lib, /👎/);
});

test("toggleReaction handles create, toggle-off, and replace", () => {
  const lib = read("lib/message-reactions.ts");
  // Create: no existing → create
  assert.match(lib, /return \{ action: \"created\"/);
  // Toggle off: same type → remove
  assert.match(lib, /return \{ action: \"removed\"/);
  // Replace: different type → replace
  assert.match(lib, /return \{ action: \"replaced\"/);
});

test("Server verifies message access before allowing reaction", () => {
  const lib = read("lib/message-reactions.ts");
  assert.match(lib, /getConversationAccess/);
  assert.match(lib, /verifyMessageAccess/);
});

test("Reaction aggregation groups by type and counts", () => {
  const lib = read("lib/message-reactions.ts");
  assert.match(lib, /getReactionsForMessages/);
  assert.match(lib, /reactions: MessageReactionSummary\[\]/);
  assert.match(lib, /myReaction: string \| null/);
});

// ── API routes ───────────────────────────────────────────────────

test("Reaction API route exists with POST and DELETE", () => {
  const route = read("app/api/chats/[conversationId]/messages/[messageId]/reactions/route.ts");
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /getAuthenticatedAppUser/);
  assert.match(route, /isValidChatId/);
  assert.match(route, /isValidReactionType/);
  assert.match(route, /toggleReaction/);
});

test("Reaction API requires authentication", () => {
  const route = read("app/api/chats/[conversationId]/messages/[messageId]/reactions/route.ts");
  assert.match(route, /Unauthorized/);
});

test("Reaction API validates reaction type server-side", () => {
  const route = read("app/api/chats/[conversationId]/messages/[messageId]/reactions/route.ts");
  assert.match(route, /Invalid reaction type/);
});

// ── Client library ───────────────────────────────────────────────

test("chat-client.ts exports reaction types and API functions", () => {
  const client = read("lib/chat-client.ts");
  assert.match(client, /MESSAGE_REACTION_TYPES/);
  assert.match(client, /MessageReactionType/);
  assert.match(client, /MessageReactionSummary/);
  assert.match(client, /export async function toggleMessageReaction/);
  assert.match(client, /export async function removeMessageReaction/);
});

test("ChatMessage type includes reactions and myReaction", () => {
  const client = read("lib/chat-client.ts");
  assert.match(client, /reactions: MessageReactionSummary\[\]/);
  assert.match(client, /myReaction: string \| null/);
});

// ── Message query integration ────────────────────────────────────

test("GET /api/chats/:id/messages includes reactions in response", () => {
  const route = read("app/api/chats/[conversationId]/messages/route.ts");
  assert.match(route, /getReactionsForMessages/);
  assert.match(route, /reactionData\.reactions/);
  assert.match(route, /reactionData\.myReaction/);
});

// ── UI components ────────────────────────────────────────────────

test("MessageBubble shows reaction bar", () => {
  const list = read("components/chat/MessageList.tsx");
  assert.match(list, /ReactionBar/);
  assert.match(list, /reaction\.type/);
  assert.match(list, /reaction\.count/);
});

test("MessageBubble has reaction picker", () => {
  const list = read("components/chat/MessageList.tsx");
  assert.match(list, /ReactionPicker/);
  assert.match(list, /MESSAGE_REACTION_TYPES/);
  assert.match(list, /Select a reaction/);
});

test("MessageBubble supports optimistic reaction toggle", () => {
  const list = read("components/chat/MessageList.tsx");
  assert.match(list, /optimisticReaction/);
  assert.match(list, /toggleMessageReaction/);
});

test("MessageList passes conversationId to MessageBubble", () => {
  const list = read("components/chat/MessageList.tsx");
  assert.match(list, /conversationId/);
  assert.match(list, /onReactionChange/);
});

test("ChatWorkspace passes onReactionChange to MessageList", () => {
  const workspace = read("components/chat/ChatWorkspace.tsx");
  assert.match(workspace, /onReactionChange/);
});

// ── Scope boundary ───────────────────────────────────────────────

test("S5 does not add WebSocket/SSE/Pusher/Ably", () => {
  const files = [
    read("lib/message-reactions.ts"),
    read("lib/chat-client.ts"),
    read("components/chat/MessageList.tsx"),
  ].join("\n");
  assert.doesNotMatch(files, /WebSocket|EventSource|pusher|ably|socket\.io/i);
});

test("S5 does not add global state libraries", () => {
  const files = [
    read("lib/message-reactions.ts"),
    read("lib/chat-client.ts"),
    read("components/chat/MessageList.tsx"),
    read("components/chat/ChatWorkspace.tsx"),
  ].join("\n");
  assert.doesNotMatch(files, /zustand|jotai|redux|react-query|swr|recoil|valtio/i);
});

test("S5 preserves S4 polling (no reaction-specific polling)", () => {
  const hook = read("hooks/useConversationMessages.ts");
  assert.match(hook, /POLL_INTERVAL_MS\s*=\s*3_000/);
  assert.doesNotMatch(hook, /reaction.*poll|poll.*reaction/i);
});

// ── Documentation ────────────────────────────────────────────────

test("S5 is documented as implemented in social.md", () => {
  const docs = read("docs/social.md");
  assert.match(docs, /S5 — Message Reactions — Implemented/);
});

test("S6 notification milestone follows S5 without renumbering", () => {
  const docs = read("docs/social.md");
  assert.match(docs, /S6 — Notifications — Implemented/);
  assert.doesNotMatch(docs, /S5 can add message-specific notification types/);
});
