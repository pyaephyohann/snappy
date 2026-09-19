# Notifications

Snappy notifications cover three categories:

1. **New Snap broadcast** — pushed to every subscribed device when any Snap is uploaded.
2. **Snap interaction alerts** — targeted to the Snap owner when another user reacts or comments.
3. **Birthday notifications** — pushed to every subscribed device when a user's birthday is detected (once per day per user).

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
| `type` | `NEW_SNAP` \| `REACTION` \| `COMMENT` \| `BIRTHDAY` |
| `body` | comment preview / reaction emoji / birthday message |
| `createdAt` | timestamp |

### Push

Uses the existing web-push infrastructure (`lib/notifications/notification-service.ts`).

- `broadcastNewSnap` (unchanged) pushes to **all** subscriptions.
- `notifySnapInteraction` pushes only to the **Snap owner's** subscriptions (`PushSubscription.userId`).

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
