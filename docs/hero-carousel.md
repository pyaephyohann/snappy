# Hero Carousel — Automatic Mode

The Hero Carousel on the user app home page is **fully automatic**. Admin no longer needs to manually manage slides, titles, or images for the normal user-app carousel.

---

## Overview

The carousel operates in one of two modes:

| Mode | Title | Images |
|------|-------|--------|
| **Birthday** | `Happy Birthday <username>` | ALL snaps uploaded by the birthday user |
| **Latest Snaps** | `Latest Snaps` | Latest 5 snaps by creation date |

The mode is determined server-side on every page load based on the current date and user birthday data.

---

## Birthday Mode

### Detection

A user's birthday is detected using the `birthday` field on the `User` model (stored as `DateTime?` in the database). Only the **month and day** are used for comparison — the birth year is ignored.

Birthday comparison uses the **Asia/Yangon** timezone (UTC+6:30). The application does not assume UTC for birthday logic.

### 3-Day Window

Birthday mode remains active for **3 calendar days** starting from the birthday:

```
Birthday: September 19

Sep 19 → Birthday mode (day 1)
Sep 20 → Birthday mode (day 2)
Sep 21 → Birthday mode (day 3)
Sep 22 → Latest Snaps mode
```

The window uses calendar days, not 72 hours from a timestamp.

### Priority Over New Snaps

During the 3-day birthday window, new Snap uploads do **not** override the birthday carousel. The carousel remains in birthday mode until the window expires.

### Multiple Birthdays

If multiple users share the same birthday (or overlapping 3-day windows), the carousel title combines their names:

```
Happy Birthday User1 & User2
```

All snaps from all birthday users are included in the carousel.

### Birthday User With No Snaps

If a birthday user has no uploaded Snaps, the carousel **falls back to Latest Snaps mode** instead of displaying an empty birthday carousel.

---

## Latest Snaps Mode

When no birthday window is active, the carousel shows:

- **Title:** `Latest Snaps`
- **Images:** The 5 most recent Snaps by `createdAt` descending

If fewer than 5 Snaps exist in the database, all available Snaps are shown.

---

## Birthday Notifications

When a user's birthday is detected (day 1 only), a push notification is sent:

```
Happy Birthday <username>
```

### Deduplication

Notifications are deduplicated per user per day. A `BIRTHDAY` notification record is created in the database, and subsequent page loads check for an existing record before sending.

The notification is sent to **all** subscribed devices (broadcast), following the existing `broadcastNewSnap` pattern.

---

## Admin — Birthday Management

### Setting a Birthday

1. Go to **Admin → Users → Edit User**
2. Set the **Birthday** field (optional date picker)
3. Save

### Editing/Clearing a Birthday

- Edit the date and save
- Clear the field and save to remove the birthday

### Effect on Hero Carousel

Birthday changes take effect **immediately** on the next page load. There is no cache to invalidate — the carousel data is computed fresh on each request.

---

## Database Schema

### User Model

```prisma
model User {
  // ... existing fields
  birthday DateTime?  // Optional birthday (month+day used for comparison)
}
```

### Notification Type

```prisma
enum NotificationType {
  NEW_SNAP
  REACTION
  COMMENT
  BIRTHDAY  // Birthday notification (deduplicated per user per day)
}
```

### Migration

```sql
ALTER TABLE "users" ADD COLUMN "birthday" TIMESTAMP(3);
ALTER TYPE "NotificationType" ADD VALUE 'BIRTHDAY';
```

Production deployments must apply migrations before the Next.js build/runtime starts. The repository `vercel.json` build command runs `prisma migrate deploy` and then the normal build. Do not use `prisma migrate reset` against production.

---

## Old Manual Hero Carousel

The previous manual Hero Carousel system (`HeroCarouselConfig`, `HeroCarouselSlide` models) is **deprecated** for the user app but remains in the database schema to avoid migration risk.

- Admin can still access the old carousel management page
- The user app no longer reads from `HeroCarouselConfig` or `HeroCarouselSlide`
- The old manual system has no effect on the automatic carousel

---

## Architecture

### Data Flow

```
User visits /home
        ↓
getAutomaticHeroCarousel()
        ↓
Check Users with birthday set
        ↓
Is today in any user's 3-day window?
        ↓
YES → Birthday mode
        ↓
Query ALL snaps uploaded by birthday user(s)
        ↓
Return { title: "Happy Birthday <name>", slides: [...] }
        ↓
NO → Latest Snaps mode
        ↓
Query latest 5 snaps by createdAt desc
        ↓
Return { title: "Latest Snaps", slides: [...] }
```

### Timezone Handling

- Birthday comparison uses `Asia/Yangon` (UTC+6:30)
- Birthday dates are stored as UTC `DateTime` in the database
- Month+day extraction uses `getUTCMonth()` and `getUTCDate()` to avoid timezone drift
- The 3-day window is calculated using calendar days, not hours

### Cache / Revalidation

No explicit cache invalidation is needed:

- The home page is a Next.js server component that fetches data on each request
- `getAutomaticHeroCarousel()` queries the database fresh every time
- Birthday mode changes automatically at midnight (Yangon time)
- Admin birthday changes take effect on the next page load
- New Snap uploads are immediately visible in Latest Snaps mode

### Performance

- Normal mode: 1 query for latest 5 snaps (indexed on `createdAt`)
- Birthday mode: 1 query for users with birthday + 1 query for their snaps
- Birthday notification deduplication: 1 query per birthday user per page load
- No unnecessary data is fetched

---

## Files

| File | Purpose |
|------|---------|
| `lib/hero-carousel.ts` | Automatic carousel logic (`getAutomaticHeroCarousel`) |
| `lib/birthday-notifications.ts` | Birthday notification trigger |
| `lib/notifications/notification-service.ts` | `sendBirthdayNotificationIfDue` (dedup + push) |
| `app/home/page.tsx` | Home page — uses automatic carousel |
| `prisma/schema.prisma` | User.birthday field, BIRTHDAY notification type |
| `components/admin/UserFormModal.tsx` | Admin birthday field in user form |
| `app/api/admin/users/[id]/route.ts` | Admin API — birthday PATCH handler |
