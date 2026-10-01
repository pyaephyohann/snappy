# Hero Carousel — Automatic Mode

The Hero Carousel on the user app home page is **fully automatic**. Admin no longer needs to manually manage slides, titles, or images for the normal user-app carousel.

---

## Overview

The carousel resolves its content on every page load with a deterministic
precedence:

| Priority | Mode | Title | Images |
|----------|------|-------|--------|
| 1 | **Birthday** | `Happy Birthday <username>` | ALL snaps uploaded by the birthday user |
| 2 | **Admin-configured** | `HeroCarouselConfig.title` (optional) | The `HeroCarouselSlide` rows managed in Admin → Hero Carousel |
| 3 | **Latest Snaps** (automatic fallback) | `Latest Snaps` | Latest 5 snaps by creation date |

Rules:

- During an active 3-day birthday window, birthday mode wins — but only when
  the birthday user(s) have at least one renderable snap.
- Outside the birthday window, the admin configuration is the primary banner
  source of truth. Whenever at least one configured slide is renderable, the
  Home banner shows exactly those slides (in their configured order) with the
  configured title.
- The automatic Latest Snaps mode is only a fallback for when neither of the
  above applies.
- Every mode drops slide records with missing or invalid image URLs (anything
  that is not a root-relative path or an `https://` URL), so a malformed row
  can never crash the carousel.

The mode is determined server-side on every page load by
`getAutomaticHeroCarousel()` in `lib/hero-carousel.ts`, the single canonical
banner resolver shared by the Web Home page and the Telegram Mini App home API.

---

## Birthday Mode (highest priority)

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

## Admin-Configured Mode

Outside the birthday window, the carousel renders the slides configured in
**Admin → Hero Carousel**:

- **Title:** the `HeroCarouselConfig.title` (optional; hidden when empty)
- **Images:** the `HeroCarouselSlide` rows ordered by `sortOrder`

Admin can add, reorder, and remove slides and edit the title through the
existing admin UI (`components/admin/HeroCarouselPageClient.tsx` and the
`/api/admin/hero-carousel/*` routes). Changes take effect on the next page
load — there is no cache to invalidate.

Slides whose Snap has a missing or invalid image URL are skipped; the
remaining configured slides are preserved in order. If no configured slide is
renderable, the banner falls through to Latest Snaps mode.

## Latest Snaps Mode (Automatic Fallback)

When no birthday window is active and no admin slide is configured, the
carousel shows:

- **Title:** `Latest Snaps`
- **Images:** The 5 most recent Snaps by `createdAt` descending

If fewer than 5 Snaps exist in the database (or some of the newest Snaps have
invalid image URLs and are dropped), all renderable Snaps are shown.

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

## Admin Hero Carousel (primary source of truth)

The manual Hero Carousel system (`HeroCarouselConfig`, `HeroCarouselSlide`
models) is **live again** as the primary banner source of truth outside the
birthday window (Milestone B1).

- Admin manages the carousel at the existing Hero Carousel management page
- The user app reads `HeroCarouselConfig` and `HeroCarouselSlide` on every
  Home render (Web and Telegram alike)
- Birthday mode still outranks the admin configuration during its 3-day
  window; the automatic Latest Snaps mode is the last-resort fallback

---

## Architecture

### Data Flow

```
User visits /home (or Telegram GET /api/telegram/mini-app/home)
        ↓
getHomeDataForUser() → getAutomaticHeroCarousel()
        ↓
Is today in any user's 3-day birthday window (Asia/Yangon)?
        ↓
YES → Birthday mode
        ↓
Query ALL snaps uploaded by birthday user(s) → validate image URLs
        ↓
At least one renderable snap?
        ↓
YES → Return { title: "Happy Birthday <name>", slides: [...] }
        ↓
NO → fall through
        ↓
Admin-configured mode: query HeroCarouselConfig + HeroCarouselSlide
        ↓
At least one renderable configured slide?
        ↓
YES → Return { title: <config title>, slides: [configured slides] }
        ↓
NO → Latest Snaps mode
        ↓
Query latest 5 snaps by createdAt desc → validate image URLs
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
- Admin slide/title/birthday changes take effect on the next page load
- New Snap uploads are immediately visible in Latest Snaps mode

### Performance

- Fallback mode: 1 query for latest 5 snaps (indexed on `createdAt`)
- Admin mode: 1 combined query for config + slides
- Birthday mode: 1 query for users with birthday + 1 query for their snaps
- Birthday notification deduplication: 1 query per birthday user per page load
- Image URL validity is checked in application code (no per-render HTTP requests)

---

## Files

| File | Purpose |
|------|---------|
| `lib/hero-carousel.ts` | Canonical banner resolver (`getAutomaticHeroCarousel`): birthday → admin slides → Latest Snaps, with slide validation |
| `lib/hero-carousel-admin.ts` | Admin CRUD helpers for `HeroCarouselConfig` / `HeroCarouselSlide` |
| `lib/birthday-notifications.ts` | Birthday notification trigger |
| `lib/notifications/notification-service.ts` | `sendBirthdayNotificationIfDue` (dedup + push) |
| `app/home/page.tsx` | Home page — uses automatic carousel |
| `prisma/schema.prisma` | User.birthday field, BIRTHDAY notification type |
| `components/admin/UserFormModal.tsx` | Admin birthday field in user form |
| `app/api/admin/users/[id]/route.ts` | Admin API — birthday PATCH handler |
