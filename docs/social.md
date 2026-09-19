# Social

This document defines Snappy's staged social roadmap. **S1 — Social Foundation is implemented.** Future milestones must preserve the existing authenticated session model, Snap ownership rules, notification infrastructure, and Telegram Mini App identity bridge.

## Pre-S1 audit

Before S1, Snappy did not have a follow or friendship relationship model. The `User` model has no follow relations, and there are no follow/unfollow API routes, relationship services, or relationship-specific authorization helpers.

The existing term "friends" is currently a product/UI label rather than a mutual-follow relationship:

- `lib/snappy-friends.ts` returns every other active user except the current user.
- `/api/users/list` returns all users and is used by web search and friend-picker surfaces.
- The web search page and `FriendsPickerPanel` navigate to a user's profile but do not create a relationship.
- Telegram bot find-friends and upload-target flows use the same broad active-user list, with server-side validation against that list.
- Friend profile pages display a user's Snaps and currently do not require mutual-follow authorization.

S1 establishes the canonical relationship rules. Existing friend-picker and Snap-targeting behavior remains intentionally broader and was not changed in this milestone.

## S1 — Social Foundation — Implemented

Migration: `20260919120000_social_user_follows`

Implemented APIs:

- `POST /api/users/:userId/follow`
- `DELETE /api/users/:userId/follow`
- `GET /api/users/:userId/relationship`
- `GET /api/friends?cursor=<id>&limit=<1-50>`

The web profile, web search, Home Friends section, Telegram profile, and Telegram search now use server-derived relationship state. Snap upload targeting and Telegram bot upload/find-friends behavior remain unchanged.

### Product rules

- User A can follow User B.
- A user cannot follow themself.
- A follow is one-way and is not friendship by itself.
- User A and User B are friends exactly when both directed follows exist.
- Unfollowing either direction immediately means the pair is no longer friends.
- Friendship is derived server-side from the two follow rows; clients never submit or assert friendship state.

### Implemented data model

S1 adds one minimal directed relationship model rather than a duplicate Friendship table:

```prisma
model UserFollow {
  id          String   @id @default(cuid())
  followerId  String
  followingId String
  createdAt   DateTime @default(now())
  follower    User     @relation("UserFollows", fields: [followerId], references: [id], onDelete: Cascade)
  following   User     @relation("UserFollowers", fields: [followingId], references: [id], onDelete: Cascade)

  @@unique([followerId, followingId])
  @@index([followerId, createdAt])
  @@index([followingId, createdAt])
  @@map("user_follows")
}
```

`@@unique([followerId, followingId])` prevents duplicate directed follows. The two indexes support following/follower lists and existence checks.

The corresponding two relation fields are added to `User`. No `Friendship` table is used: it would duplicate state, require transactionally synchronizing two follow rows, and create stale-state risk after unfollow. A mutual-follow query is both authoritative and simple:

```text
exists(followerId = A, followingId = B)
AND exists(followerId = B, followingId = A)
```

For lists, query follows joined to users and constrain the reverse follow with `some`/`exists` or a dedicated mutual-follow query. If a later high-volume workload proves the query insufficient, optimize with indexes or a read projection only after measuring it.

### S1 behavior and API

The authenticated server routes are:

- `POST /api/users/:userId/follow` — create the directed follow, rejecting self, inactive/missing users, duplicates, and unauthorized requests.
- `DELETE /api/users/:userId/follow` — remove only the authenticated user's directed follow.
- `GET /api/users/:userId/relationship` — return server-derived following/follower/friend state for the viewer.
- `GET /api/friends` — list mutual-follow friends for the authenticated user with pagination.

Follower/following list endpoints are intentionally deferred until needed.

Use the existing `getAuthenticatedAppUser`/`resolveUserFromSession` identity helpers. Use database uniqueness for race-safe duplicate prevention and map conflicts to a stable client response. A follow/unfollow mutation should be idempotent from the UI's perspective where practical.

### S1 UI implementation

The implementation uses the existing navigation and surfaces. Relationship state is integrated at these locations:

- A relationship action on `FriendProfileClient` / profile headers.
- The existing Home Friends section now lists mutual-follow friends only.
- A standalone Friends screen and follower/following counts remain future UI work.
- Search results showing relationship state and a Follow/Following action.
- Telegram Mini App Search/Profile using the same relationship APIs and shared relationship state components.

The current web `/search`, `/friends/[username]`, profile, and Telegram friend-profile routes are the main integration points. Existing Snap upload targeting and bot find-friends semantics must not silently change in S1; they need an explicit product decision about whether they mean mutual friends or any active user.

## S2 — Chat Backend — Implemented

S2 backend is implemented. Chat UI, realtime delivery, message notifications, message reactions, and user status remain intentionally unimplemented for later milestones.

Implemented migration: `20260920120000_social_chat_backend`

Implemented APIs:

- `GET /api/chats`
- `POST /api/chats`
- `GET /api/chats/:conversationId/messages`
- `POST /api/chats/:conversationId/messages`
- `PATCH /api/chats/:conversationId/read`

### Scope and product rules

- Private 1-to-1 text chat only.
- A conversation is usable only while both users are active mutual followers.
- Friendship is always derived from `UserFollow`: `A → B` and `B → A`.
- Unfollowing either direction blocks new messages but preserves the conversation and existing messages.
- If mutual friendship is restored, the existing conversation becomes usable again.
- Images, videos, files, voice messages, attachments, message reactions, chat notifications, and user status are outside S2.

### Implemented data model

Prefer a `Conversation` plus `ConversationParticipant` model over storing two user columns directly on `Conversation`:

```prisma
model Conversation {
  id             String                    @id @default(cuid())
  userLowId      String
  userHighId     String
  lastMessageAt  DateTime?
  createdAt      DateTime                  @default(now())
  updatedAt      DateTime                  @updatedAt
  userLow        User                      @relation("ConversationUserLow", fields: [userLowId], references: [id], onDelete: Cascade)
  userHigh       User                      @relation("ConversationUserHigh", fields: [userHighId], references: [id], onDelete: Cascade)
  participants   ConversationParticipant[]
  messages       Message[]

  @@unique([userLowId, userHighId])
  @@index([lastMessageAt])
  @@map("conversations")
}

model ConversationParticipant {
  id             String       @id @default(cuid())
  conversationId String
  userId         String
  lastReadAt     DateTime?
  createdAt      DateTime     @default(now())
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([conversationId, userId])
  @@index([userId, conversationId])
  @@map("conversation_participants")
}

model Message {
  id             String       @id @default(cuid())
  conversationId String
  senderId       String
  content        String
  createdAt      DateTime     @default(now())
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender         User         @relation(fields: [senderId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt, id])
  @@index([conversationId, senderId, createdAt, id])
  @@map("messages")
}
```

The exact Prisma relation names and whether `lastReadAt` is later replaced by a message cursor should be finalized during implementation. The participant table is recommended because it gives server-side membership checks and a natural per-user read cursor without adding `userAReadAt`/`userBReadAt` fields. The application must create exactly two participants in the same transaction as the conversation.

### Conversation uniqueness

Normalize the pair before every lookup/create: lexicographically smaller active user ID becomes `userLowId`, and the larger becomes `userHighId`. The database `@@unique([userLowId, userHighId])` is the authoritative duplicate guard. Conversation creation should use `upsert` or catch Prisma `P2002` and then read the existing row, so concurrent requests cannot create duplicate A↔B conversations. The API must reject self-pairs before normalization.

### Friendship authorization

Reuse `getRelationshipState` / the canonical S1 relationship query rather than duplicating follow logic. A conversation create, conversation read/list, message history, message send, and read-state mutation must resolve the authenticated active Snappy user server-side and verify participant membership. Message sends must additionally verify that the other participant is still active and that both directed `UserFollow` rows still exist. Client-supplied `isFriend`, `senderId`, recipient IDs, or participant lists must never authorize an operation.

### Friendship removal

Unfollowing does not delete a conversation, participants, or messages. It only makes the friendship check fail, so new conversation creation/opening and message sends are rejected while existing history remains preserved. Re-following in both directions makes the same canonical pair usable again. A future privacy/blocking policy may add stronger restrictions, but S2 should not invent one.

### Messages, ordering, and read state

S2 should store only bounded plain text and omit all attachment/media columns. `editedAt`, `deletedAt`, soft-delete state, and message-level reactions should be deferred unless product requirements change. `ConversationParticipant.lastReadAt` is the recommended initial read cursor: marking a conversation read updates only the authenticated participant row, and unread count is the number of messages newer than that timestamp sent by the other participant. This avoids updating every message when a mobile user opens a chat. If strict ordering under equal timestamps becomes important, replace it with a participant `lastReadMessageId` cursor plus a `(createdAt, id)` ordering tuple.

History should use keyset pagination ordered by `createdAt DESC, id DESC`, with a cursor containing both values (or an opaque encoded cursor). The `(conversationId, createdAt, id)` index supports this query. Reverse the returned page for chronological rendering. Do not use offset pagination or load an entire conversation.

### Validation and abuse controls

Validate on the server with the existing Zod convention:

- trim surrounding whitespace and reject empty/whitespace-only content;
- enforce a documented maximum, recommended initially 2,000 Unicode code points;
- preserve normal Unicode and newlines;
- reject malformed JSON and invalid types;
- reject control characters other than tab/newline/carriage return;
- do not accept URLs as a special trusted type or any attachment fields;
- apply a shared/distributed rate limit to conversation creation and message sends when available, retaining a small per-instance fallback only if no shared limiter exists.

Store text as text, escape it through the normal React rendering path, and do not add broad content filtering in S2.

### Implemented API

- `GET /api/chats` — authenticated active user only; return paginated conversations the viewer participates in, including the other active participant, last message preview/time, and unread count. Order by `lastMessageAt DESC, id DESC`.
- `POST /api/chats` — authenticated active user; body contains only the target user ID. Reject self, missing/inactive target, and non-friends. Normalize the pair and return the existing or newly-created conversation.
- `GET /api/chats/:conversationId/messages` — authenticated active participant and currently active friend; return cursor-paginated text messages with sender metadata. Never authorize from the ID alone.
- `POST /api/chats/:conversationId/messages` — authenticated active participant and currently active friend; body contains only `content`. Derive `senderId` from the session, validate text, create the message, and update `lastMessageAt` transactionally.
- `PATCH /api/chats/:conversationId/read` — authenticated participant only; update only that participant's read cursor. Friendship should not be required merely to mark preserved history read, but access and active-account checks remain mandatory.

Use stable JSON error categories such as `401` unauthenticated, `403` inactive/non-member/not-friends, `404` missing conversation or target, `409` invalid/self/duplicate state where applicable, `413` oversized content, `429` rate limited, and `400` malformed input. Exact response envelopes should follow existing route conventions.

### Conversation list and unread counts

Do not add message notifications or per-conversation counters in S2. Use `lastMessageAt` as a small, transactionally maintained activity field so the list can be ordered without an N+1 latest-message query. Return the latest message through a bounded relation query or a follow-up batched query. Compute unread counts from `lastReadAt` and messages authored by the other participant; measure query cost before adding a denormalized counter. A later scale milestone can introduce a read-model counter only with reconciliation guarantees.

### Realtime recommendation

Do not add realtime infrastructure in S2. Start with cursor-based polling or refresh-on-focus, which works in Web, PWA, and Telegram Mini App and fits the current serverless/Vercel deployment. Server-Sent Events are a possible later improvement but require long-lived connection handling and platform review. WebSockets or a managed realtime provider should be considered only after usage and delivery requirements justify the operational cost. The backend should expose ordinary HTTP reads/writes so any later transport can reuse it.

### Platform compatibility

Web, PWA, and Telegram Mini App must use the same Conversation, Participant, Message, friendship authorization, and API layers. Telegram authentication already creates the normal signed Snappy session for the linked `User.id`; future Telegram routes should be thin presentation/navigation adapters. No TelegramConversation, TelegramMessage, Telegram-specific relationship state, or bot chat database should be introduced. Telegram BackButton, safe-area, and reconnect behavior belong to the later UI milestone.

### Security model

Every chat request must resolve an active user from the signed session, not from request data. Conversation queries must constrain participant membership in the database query itself. Message queries and mutations must verify both conversation membership and the current mutual-follow state. The server derives sender and recipient identities, rejects self-conversations, checks target/account activity, uses the database pair uniqueness constraint, and applies rate limits. Unfollowing must not grant history access to a non-participant, and a stale client cannot bypass the server friendship check by retaining an old conversation ID.

### Editing and deletion policy

Defer editing, message deletion, conversation deletion, blocking, reporting, and moderation controls from the first S2 implementation. Preserve immutable text history initially. If deletion becomes necessary later, define retention/audit semantics before adding soft-delete fields; do not let a client erase a conversation or another user's messages.

### Future notifications integration

Do not modify notification models in S2. The later notification milestone can add a `NEW_MESSAGE` notification type to the existing `Notification` enum, create a recipient row with `userId` as the other participant and `actorId` as the sender, link to a conversation route through a safe body/URL convention, and target only the recipient's `PushSubscription.userId` rows. It should deduplicate or suppress notifications while the recipient is actively reading, respect unread/read state, and define a Telegram delivery strategy separately.

### S2 migration implementation

Create one additive migration only after the schema is approved. Add `conversations`, `conversation_participants`, and `messages` with `cuid` IDs, non-null foreign keys, pair uniqueness, participant uniqueness, pagination/activity indexes, and cascade deletion from a user/conversation to dependent rows. Do not alter `UserFollow`, `Notification`, `PushSubscription`, existing Snap tables, or existing migration history. Apply through the existing direct Neon migration path; never reset or use `db push` in production.

### S2 testing plan

Cover schema and API behavior with focused tests for:

- authenticated friend conversation creation and concurrent duplicate creation;
- non-friend, self, inactive-target, inactive-viewer, and unauthenticated rejection;
- conversation IDOR and participant membership enforcement;
- text-only validation, whitespace/empty/oversized/control-character rejection;
- sender identity derived from the session and client `senderId` ignored/rejected;
- friend message send, non-friend send rejection, and correct conversation ownership;
- unfollow preserving conversation/history while blocking new messages;
- mutual refollow restoring message ability;
- read cursor and unread count behavior;
- stable cursor pagination without duplicates across pages;
- rate-limit responses and concurrent race safety;
- Web/PWA and Telegram authentication compatibility without Telegram-specific storage.

Run Prisma validation/generation, typecheck, lint, build, S2 tests, S1 tests, and the existing auth/profile/home/Telegram regression suites before migration deployment.

### S2 implementation sequence — Completed

1. Added the approved participant-based conversation, message, and read-cursor models.
2. Added one additive migration with pair uniqueness, participant uniqueness, indexes, and cascade foreign keys.
3. Added shared conversation normalization, friendship authorization, membership, cursor, and message-validation helpers.
4. Implemented transactional conversation open/create and secured conversation-list/history/send/read APIs.
5. Added race-safety, IDOR, friendship-removal, validation, pagination, and rate-limit coverage.
6. Kept chat UI, realtime delivery, reactions, notifications, and status for their designated later milestones.

## S3 — Chat UI (planned)

Not implemented. Add a conversation list, friend-only conversation entry point, and responsive web/PWA and Telegram Mini App chat screens. Preserve Telegram BackButton and safe-area behavior.

## S4 — Message Reactions (planned)

Not implemented. Add a unique reaction per user/message (or an explicitly defined multi-reaction rule), server authorization, and reaction aggregation. Do not reuse Snap reactions without a separate message relation.

## S5 — Notifications (planned)

Not implemented. Extend the existing `Notification` and `NotificationType` architecture only after message delivery semantics are defined. A message notification should target the recipient, never trust a client-supplied recipient, respect read state, and integrate with `PushSubscription.userId` and the existing notification list/unread badge. Telegram Mini App in-app refresh/polling or Telegram delivery must be designed separately; no notification type is added in S1.

## S6 — User Status (planned)

Not implemented. Add a bounded text status to `User` or a separate status history model only after deciding whether status is persistent, expiring, editable, and visible to all users or only friends. Validate and sanitize it server-side and expose it through shared profile/user payloads.

## S7 — Production Polish (planned)

Not implemented. Add rate limits, abuse reporting/blocking, moderation controls, privacy settings, observability, pagination/load testing, migration rollout checks, push delivery monitoring, and real-device Web/PWA/Telegram QA.

## Authorization and security requirements

Every relationship endpoint must:

- Require an authenticated, active Snappy user resolved server-side.
- Derive `followerId` from the session, never from a request body or arbitrary query parameter.
- Reject self-follow attempts.
- Verify the target exists and is eligible (at minimum active; exact privacy rules are a product decision).
- Rely on the composite unique constraint to prevent duplicates under concurrent requests.
- Allow deletion only of the caller's own directed follow.
- Derive `isFriend` from both rows on the server for every response and authorization decision.
- Avoid exposing relationship data for inactive/deleted users.
- Use the S1 best-effort per-instance follow mutation limiter (`lib/social-rate-limit.ts`); replace it with a shared external limiter when a global limiter is introduced.
- Add CSRF protection consistent with the existing mutation route conventions and audit logging if those platform-wide controls are introduced.

## Notifications architecture integration point

Current notifications are persisted in `Notification`, addressed by `userId`, attributed by `actorId`, and rendered by `/api/notifications` and `NotificationsPageClient`. Existing push delivery is implemented by `lib/notifications/notification-service.ts` and uses user-scoped `PushSubscription` rows for targeted Snap interaction pushes. S1 should not change this system. S5 can add message-specific notification types and URL routing after chat exists.

## Telegram Mini App considerations

The Mini App validates Telegram `initData`, resolves the linked `TelegramAccount`, and creates the normal signed Snappy session with the linked `User.id`. Mini App APIs already use the same authenticated app-user helpers and do not accept a client-supplied Snappy identity.

Later relationship UI, chat UI, and status work should therefore:

- Reuse the same `UserFollow` data and `/api` authorization rules.
- Use Telegram-local routes/components only for presentation and navigation.
- Keep unlinked users in the existing connect/reconnect flow.
- Add Telegram BackButton and safe-area handling without duplicating business logic.
- Decide later whether Telegram notifications are in-app polling, web push where supported, bot messages, or a combination; do not assume the bot identity alone authorizes a relationship.

The existing bot's "friends" flows currently use active-user lists and are not proof of mutual friendship. They must be migrated to S1 semantics only through an explicit compatibility change and tests.

## S1 implementation files

The S1 implementation includes:

- `prisma/schema.prisma`
- a new Prisma migration under `prisma/migrations/`
- `lib/relationships.ts`, `lib/relationship-state.ts`, and `lib/social-rate-limit.ts`
- authenticated routes under `app/api/users/[userId]/follow/`, `app/api/users/[userId]/relationship/`, and `app/api/friends/`
- shared relationship types/components near profile/search/friends
- web profile/search integration files
- Telegram Search/Profile integration files and focused Telegram tests
- S1 unit/API/security tests

Chat backend is implemented in S2. Chat UI, message reactions, chat notifications, and status remain reserved for later milestones.

## S1 testing plan

- Schema migration applies cleanly and preserves all existing migrations.
- Composite uniqueness rejects duplicate follows, including concurrent attempts.
- Self-follow is rejected.
- Unauthenticated and inactive users are rejected.
- A user cannot follow/unfollow on behalf of another user.
- One-way follow reports `following: true`, `follower: false`, `isFriend: false`.
- Two-way follow reports `isFriend: true`.
- Removing either direction immediately reports `isFriend: false`.
- Friend lists contain only mutual-follow active users and are paginated.
- Search/profile relationship state is scoped to the authenticated viewer.
- Web/PWA and Telegram Mini App use the same server responses.
- Existing Snap, upload, notification, and Telegram authentication tests remain green.

## S1 implementation sequence — Completed

1. Product decisions confirmed: mutual follow is friendship; Snap targeting remains unchanged.
2. Added `UserFollow`, User relations, and one migration; no `Friendship` table.
3. Added shared relationship query helpers with explicit viewer/target authorization.
4. Added follow, unfollow, relationship, and paginated mutual-friend APIs.
5. Added relationship security and mutual-follow tests.
6. Integrated relationship state into web profile/search and the Home Friends section.
7. Integrated the same relationship state into Telegram profile/search surfaces.
8. Preserved existing bot/upload/find-friends behavior.
9. Prisma validation, typecheck, lint, build, and regression verification remain part of the release gate.
10. Manual Web/PWA/Telegram QA remains recommended before production rollout.

S1 is implemented locally but has not been committed or pushed.
