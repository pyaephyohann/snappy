/**
 * Social S2 chat backend tests.
 * Run: node --import tsx --test scripts/social-s2.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  decodeConversationCursor,
  decodeMessageCursor,
  encodeConversationCursor,
  encodeMessageCursor,
  normalizeUserPair,
  validateMessageContent,
} from "../lib/chat-validation";

const root = resolve(import.meta.dirname, "..");
function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

test("canonical user ordering is deterministic and rejects self-chat", () => {
  assert.deepEqual(normalizeUserPair("z-user", "a-user"), {
    userLowId: "a-user",
    userHighId: "z-user",
  });
  assert.equal(normalizeUserPair("same", "same"), null);
});

test("message validation accepts Unicode and newlines but rejects invalid text", () => {
  assert.deepEqual(validateMessageContent("  Hello 👋\n世界  "), {
    ok: true,
    content: "Hello 👋\n世界",
  });
  assert.equal(validateMessageContent(" \n\t ").ok, false);
  assert.equal(validateMessageContent("a\u0000b").ok, false);
  assert.equal(validateMessageContent("😀".repeat(2001)).ok, false);
  assert.equal(validateMessageContent({}).ok, false);
});

test("message and conversation cursors round-trip both ordering fields", () => {
  const messageCursor = { id: "message-1", createdAt: "2026-09-20T10:00:00.000Z" };
  const conversationCursor = { id: "conversation-1", lastMessageAt: null };
  assert.deepEqual(decodeMessageCursor(encodeMessageCursor(messageCursor)), messageCursor);
  assert.deepEqual(
    decodeConversationCursor(encodeConversationCursor(conversationCursor)),
    conversationCursor,
  );
  assert.equal(decodeMessageCursor("not-a-cursor"), null);
});

test("S2 schema contains only the approved chat models and constraints", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model Conversation \{/);
  assert.match(schema, /model ConversationParticipant \{/);
  assert.match(schema, /model Message \{/);
  assert.match(schema, /@@unique\(\[userLowId, userHighId\]\)/);
  assert.match(schema, /@@unique\(\[conversationId, userId\]\)/);
  assert.match(schema, /lastReadAt/);
  assert.doesNotMatch(schema, /model Friendship/);
  assert.doesNotMatch(schema, /editedAt|deletedAt|attachment|mediaUrl/);
});

test("S2 migration is additive and has required tables, indexes, and cascades", () => {
  const migration = read("prisma/migrations/20260920120000_social_chat_backend/migration.sql");
  for (const table of ["conversations", "conversation_participants", "messages"]) {
    assert.match(migration, new RegExp(`CREATE TABLE \\"${table}\\"`));
  }
  assert.match(migration, /conversations_userLowId_userHighId_key/);
  assert.match(migration, /conversation_participants_conversationId_userId_key/);
  assert.match(migration, /messages_conversationId_createdAt_id_idx/);
  assert.match(migration, /ON DELETE CASCADE/);
});

test("chat APIs enforce session, membership, friendship, and server sender identity", () => {
  const conversations = read("app/api/chats/route.ts");
  const messages = read("app/api/chats/[conversationId]/messages/route.ts");
  const readState = read("app/api/chats/[conversationId]/read/route.ts");

  for (const source of [conversations, messages, readState]) {
    assert.match(source, /getAuthenticatedAppUser/);
    assert.match(source, /Unauthorized/);
  }
  assert.match(conversations, /areUsersFriends/);
  assert.match(conversations, /userLowId_userHighId/);
  assert.match(conversations, /participants: \{ some: \{ userId: viewer\.id \} \}/);
  assert.match(messages, /canUseConversation/);
  assert.match(messages, /senderId: viewer\.id/);
  assert.match(messages, /createdAt: \{ lt:/);
  assert.match(messages, /lastMessageAt: message\.createdAt/);
  assert.doesNotMatch(messages, /body\.senderId/);
  assert.doesNotMatch(messages, /body\.isFriend/);
  assert.match(readState, /where: \{ id: access\.viewerParticipant\.id \}/);
});

test("S2 documentation and later milestones remain correctly scoped", () => {
  const docs = read("docs/social.md");
  assert.match(docs, /S2 — Chat Backend — Implemented/);
  assert.match(docs, /ConversationParticipant/);
  assert.match(docs, /lastReadAt/);
  assert.match(docs, /S3 — Chat UI/);
  assert.match(docs, /S4 — Near-Realtime Chat Synchronization/);
  assert.match(docs, /S5 — Message Reactions \(planned\)/);
  assert.match(docs, /S6 — Notifications \(planned\)/);
  assert.match(docs, /S7 — User Status \(planned\)/);
});
