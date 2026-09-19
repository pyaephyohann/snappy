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

## S2 — Chat Backend (planned)

Not implemented. Add a 1-to-1 conversation/message model authorized only for mutual friends. Messages must be text-only, length-limited, server-validated, and must not accept file or media fields. Design for cursor pagination and indexes on conversation participants and message creation time.

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

Later relationship/chat/status work should therefore:

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

Chat, message reactions, chat notifications, and status remain unimplemented and are reserved for later milestones.

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
