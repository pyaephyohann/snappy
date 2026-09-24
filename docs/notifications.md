# Notifications

Snappy notifications cover four categories:

1. **New Snap broadcast** — pushed to every subscribed device when any Snap is uploaded.
2. **Snap interaction alerts** — targeted to the Snap owner when another user reacts or comments.
3. **Birthday notifications** — pushed to every subscribed device when a user's birthday is detected (once per day per user).
4. **Chat message notifications** — targeted to the other participant after an authorized message is created.

---

## Snap Reaction Notifications

When **User A reacts to User B's Snap**, User B is notified.

```
User A reaction
        ↓
Server identifies Snap owner
        ↓
Create Notification
        ↓
Targeted push to owner
```

- **Receiver** = Snap owner (`Snap.userId`).
- **Actor** = the authenticated user who reacted.
- **Self reactions do not notify** (actor == owner → no-op).
- **Only new reactions notify.** Changing or removing a reaction does not create a notification.
- Notification body carries the reaction emoji (e.g. `❤️`).

## Snap Comment Notifications

When **User A comments on User B's Snap**, User B is notified.

- The Snap owner receives a **notification record** and a **targeted push**.
- **Self comments do not notify.**
- The **comment preview is used as the notification body**.
- Existing comment behavior (create/list/like) is unchanged.

---

## Chat Message Notifications

When User A sends an authorized message to User B, Snappy creates one `NEW_MESSAGE` notification for User B.

- `userId` is the server-derived recipient.
- `actorId` is the persisted message sender.
- `messageId` links the notification to the message and is unique, preventing duplicate notification rows.
- The body is a bounded message preview.
- Self-notifications, failed sends, and unauthorized sends do not create notifications.
- Web Push targets only the recipient's `PushSubscription.userId` rows.
- Web/PWA clicks route to `/chats/<conversationId>`.
- Telegram Mini App uses the same persisted notification/API path and routes to `/telegram/app/chats/<conversationId>`.
- Telegram Bot delivery is deferred and is not implemented in S6.

`Notification.readAt` and chat `ConversationParticipant.lastReadAt` are independent. Opening a chat does not automatically mark the global notification read.

## Presence / Heartbeat Events

Presence heartbeats (`PATCH /api/presence`, S7) **do not create notifications and do not send push notifications**. `NotificationType` is unchanged by S7, presence delivery has no Web Push path, and no Telegram Bot presence message exists. Online / offline / last-seen state is derived from `User.lastSeenAt` and only ever surfaces through already-authorized chat DTOs.

## Birthday Notifications

When a user's birthday is detected (day 1 of the 3-day window), a notification is sent:

- **Title:** `Happy Birthday`
- **Body:** `Happy Birthday <username>`
- **Deduplication:** One notification per user per day (tracked via `BIRTHDAY` notification type)
- **Delivery:** Broadcast to all subscribed devices
- **Trigger:** Automatic on home page load (server-side)

See [Hero Carousel documentation](./hero-carousel.md) for full birthday mode details.

---

## Notification Architecture

### Server-side

`Notification` database records store:

| Field | Meaning |
|-------|---------|
| `userId` | recipient (Snap owner / birthday user) |
| `actorId` | user who reacted/commented (self for birthday) |
| `snapId` | related Snap |
| `messageId` | related chat message; unique for `NEW_MESSAGE` |
| `type` | `NEW_SNAP` \| `NEW_MESSAGE` \| `REACTION` \| `COMMENT` \| `BIRTHDAY` |
| `body` | comment preview / reaction emoji / birthday message |
| `createdAt` | timestamp |

### Push

Uses the existing web-push infrastructure (`lib/notifications/notification-service.ts`).

- `broadcastNewSnap` (unchanged) pushes to **all** subscriptions.
- `notifySnapInteraction` pushes only to the **Snap owner's** subscriptions (`PushSubscription.userId`).
- Chat message notifications push only to the server-derived recipient's subscriptions.
- Push delivery is non-fatal: the persisted notification remains if delivery fails.

Notification delivery is **fire-and-forget**: a notification failure never fails the reaction/comment API response.

### Client

Notifications are stored locally (`lib/local-notifications.ts`), rendered on `/notifications`, with the unread badge in `BottomNav` and service-worker sync via `NotificationSync`.

---

## Deployment

Requires:

```bash
prisma migrate deploy
```

Migrations:
- `20260918121542_snap_interaction_notifications` — Snap interaction notifications
- `20260919100000_user_birthday_and_hero_carousel` — User birthday field + BIRTHDAY notification type
