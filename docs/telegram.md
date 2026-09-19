# Snappy Telegram bot

Telegram talks to the existing Next.js app over a webhook. The bot uses the same PostgreSQL database, Cloudinary pipeline, and Snap model as the web app.

```
Telegram → POST /api/telegram/webhook → lib/telegram → lib/snap-* / Prisma
Web link  → /telegram/connect → POST /api/telegram/link (Snappy session)
Mini App  → /telegram/app → POST /api/telegram/mini-app/session (initData → session)
```

## Supported commands

| Command | Behavior |
| --- | --- |
| `/start` | Welcome message plus Find Friends / Upload / Mini App / web buttons |
| `/help` | Lists commands; clears conversation state |
| `/find_friends` | View your friends' Snaps (friend list → name search → 3 Snaps per page) |
| `/upload` | Choose a friend, then upload a photo Snap to that friend's profile |

Registered bot commands (via `telegram:setup`): `start`, `help`, **`find_friends`**, `upload`. Telegram Bot API command names cannot contain hyphens; users may also type **`/find-friends`** — the bot handles both. The legacy bot command **`/find` (Snap code lookup) has been removed** — it is no longer registered and is not listed in help.

The main inline keyboard **👥 Find Friends** starts the same flow as `/find_friends`.

Deep links: `/start find-friends`, `/start findfriends`, or `/start find_friends` opens the find-friends flow; `/start upload` opens upload.

The bot menu button **📱 Open Snappy** (configured by `npm run telegram:setup`) opens the Mini App at `/telegram/app` when `SNAPPY_PUBLIC_URL` is set.

### Bot Find vs Mini App Find

| Feature | Where | Snap code? |
| --- | --- | --- |
| **Find friends' Snaps** | Bot `/find_friends` (or `/find-friends`) | No — type a friend's name |
| **Find Snap by code** | Mini App `/telegram/app/find` | Yes — same CUID rules as web |

Snap-code lookup is **not** available through the Telegram bot anymore. The Mini App find screen, `/api/telegram/mini-app/find`, and deep links (`screen=find`, `start_param=find_<cuid>`) are **unchanged**.

## Telegram Mini App

Route: **`/telegram/app`** (full URL: `{SNAPPY_PUBLIC_URL}/telegram/app`).

### Navigation and shared web experience

| Route | Purpose |
| --- | --- |
| `/telegram/app` | Home — paginated Snap feed using the shared Snap card/viewer data shape |
| `/telegram/app/search` | Web-equivalent friend search using the shared friend picker |
| `/telegram/app/camera` | Shared web camera, friend targeting, composer, and upload flow |
| `/telegram/app/upload` | Same shared upload flow as Camera, including **who this Snap is for** |
| `/telegram/app/alerts` | Shared web notifications client with Telegram-local friend targets |
| `/telegram/app/profile` | Shared web profile client, including profile photo picker, My Snaps, edits, and Telegram controls |
| `/telegram/app/find` | Legacy Snap-code lookup deep-link route |

The bottom navigation mirrors the web structure: Home, Search, center Camera, Alerts, and Profile. It is fixed above `env(safe-area-inset-bottom)` and uses the shared web camera/friend-picker/upload pipeline. Nested routes retain Telegram **BackButton** behavior.

Home loads 12 Snaps per request with an authenticated cursor and exposes a mobile-friendly Load more control. Empty, retry, session-expired, loading-more, and end-of-feed states are rendered in the Mini App.

PWA install prompt and service worker registration are skipped under `/telegram/app/*`.

### Integration & deep links (T5)

**Canonical HTTPS deep link:**

`{SNAPPY_PUBLIC_URL}/telegram/app?screen=<home|find|upload|profile>&code=<snap-cuid>`

- `code` is optional and only used with `screen=find`. Values are normalized with the same Snap CUID rules as T2/T4.3; invalid codes open the Find form without leaking whether a Snap exists.
- Example: `https://snapppy.info/telegram/app?screen=find&code=clxyz…`

**Telegram `start_param` (compact, for `startapp` links):**

`find`, `find_<cuid>`, `upload`, `profile`, `home` — parsed client-side for navigation only, never for authentication.

**Bot → Mini App**

- Menu / **📱 Open Snappy** → `/telegram/app` (unchanged).
- Mini App keyboards may still include **📱 Open Find in Snappy** (`web_app` URL with `screen=find`, optional `code`) for snap-code find inside the Mini App — not via bot `/find`.
- `/start find-friends`, `/start findfriends`, `/start find_friends`, and `/start upload` deep-link into the corresponding bot flows.

**Mini App → Bot**

- Set `TELEGRAM_BOT_USERNAME` (public handle, no secret).
- Home shows **Open Snappy Bot**; Find shows **Find with Bot** (`https://t.me/<bot>?start=find`) — opens Mini App-oriented bot entry, not bot Snap-code chat.
- Uses `Telegram.WebApp.openTelegramLink` when available.

**Home quick actions:** Find / Upload / Profile tiles link to existing Mini App routes (bottom nav unchanged).

### Production hardening (T6)

**Webhook:** `POST /api/telegram/webhook` requires matching `TELEGRAM_WEBHOOK_SECRET` (`x-telegram-bot-api-secret-token`). Malformed JSON, invalid updates, and bodies over 256 KB are rejected (4xx). Handler failures are logged without secrets; Telegram still receives `{ ok: true }` so transient app errors do not cause endless retries. Missing bot token or webhook secret → **503** (webhook disabled).

**Mini App auth:** `initData` is capped at 8 KB, HMAC-validated server-side, with `auth_date` TTL. Linked users receive an HttpOnly Snappy session; APIs return `{ code: "session_expired" }` on **401**. Screens show **Reconnect** (same `POST /api/telegram/mini-app/session` flow). `initDataUnsafe` is never used for identity.

**Deep links:** Query params take precedence over `start_param`. Invalid Snap codes open the Find form. Unknown `screen` → home. Oversized `start_param` (>512 chars) is ignored.

**Bot errors:** Uncaught handler errors reply with a generic user message (no stack traces or Telegram JSON).

**Setup:** `npm run telegram:setup` needs `TELEGRAM_BOT_TOKEN`, valid `TELEGRAM_WEBHOOK_SECRET`, and `SNAPPY_PUBLIC_URL` or `TELEGRAM_WEBHOOK_URL`. Warns if `TELEGRAM_BOT_USERNAME` is missing (Mini App → bot links).

**Manual verification:** Use `npm run telegram:verify-production` plus the [release checklist](./telegram-release-checklist.md) after deploy.

### T7 Live Verification

| Field | Value |
| --- | --- |
| **Date** | 2026-09-18 |
| **Environment** | Production `https://snapppy.info/` |
| **Telegram client** | NOT TESTED — no real Telegram client session in the T7 agent run |
| **Vercel env audit** | NOT TESTED — Vercel MCP not connected in this environment |
| **Local `.env.local`** | Missing in agent workspace (secrets not available for `getWebhookInfo`) |

**Remote probes (non-secret, agent run):**

| Check | Result |
| --- | --- |
| `GET /telegram/app` | PASS — page loads (browser shows “Connecting…” outside Telegram, expected) |
| `GET /api/telegram/webhook` | PASS — **405 Method Not Allowed** (route deployed) |

**Live Telegram flows (bot, Mini App UI, auth, linking, find, upload, profile, deep links, BackButton, reconnect):** **NOT TESTED** — unavailable in current environment. Complete these in Telegram and record results in [telegram-release-checklist.md](./telegram-release-checklist.md).

**Automated regression (agent run):** all `npm run test:telegram-*` scripts — see T7 final report / CI.

**Production logs:** NOT TESTED — no log access without Vercel credentials in this environment.

**Operator next steps:** load production env locally → `npm run telegram:verify-production` → walk the release checklist in Telegram → update checklist statuses → commit doc updates if needed.

### Session (T4.1 foundation)

The Mini App loads Telegram’s official [WebApp JS SDK](https://telegram.org/js/telegram-web-app.js) in the browser, calls `Telegram.WebApp.ready()` and `expand()`, and hides the BackButton on the root screen.

### initData validation (server)

The client sends **`initData`** (from `Telegram.WebApp.initData`) to `POST /api/telegram/mini-app/session`. The server never trusts usernames or user IDs from the client without verification.

1. Parse `initData` as query parameters.
2. Build the data-check string (sorted `key=value` lines, excluding `hash`).
3. Derive `secret_key = HMAC_SHA256("WebAppData", bot_token)` and compare `HMAC_SHA256(secret_key, data-check-string)` to `hash`.
4. Enforce **`auth_date` freshness** (default max age **3600 seconds**, override with `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS`, clamped between 60 and 86400). Slightly future `auth_date` (≤60s) is rejected.
5. Parse the `user` JSON and require a positive integer `id` and non-empty `first_name`.

`initDataUnsafe` is for display hints only; authorization always uses validated `initData`.

### Session bridge

After validation, the server looks up `telegram_accounts` by **numeric Telegram user ID** (same identity model as the webhook).

| Link status | Behavior |
| --- | --- |
| Linked | `createSession()` from `lib/auth.ts` — same HttpOnly `snappy_session` cookie as web login |
| Unlinked | No Snappy session; response includes a **Connect Snappy** URL from the existing link-challenge flow |

Unlinked users are **not** auto-provisioned. They must complete T3 linking (`/telegram/connect` + `POST /api/telegram/link`).

### Security

- Production must use **HTTPS** (Telegram requirement for Mini Apps).
- Bot token, webhook secret, raw `initData`, and session cookies must not appear in logs.
- No secrets in `NEXT_PUBLIC_*` or client bundles.

### Local development

- Mini Apps are easiest to test against an **HTTPS** tunnel (ngrok, Cloudflare Tunnel, etc.) with `SNAPPY_PUBLIC_URL` pointing at that origin.
- Set `TELEGRAM_BOT_TOKEN` locally so initData signatures validate.
- Run `npm run telegram:setup` after changing the public URL so the menu button and webhook stay aligned.

## Account linking (explicit)

Telegram identity is **`from.id`** (numeric Telegram user ID) from verified webhook updates and validated Mini App `initData` — never from user-typed text. Usernames are stored for display only and can change.

1. User sends `/upload` without a link (or opens the Mini App while unlinked).
2. Server creates a **single-use, short-lived** row in `telegram_link_challenges` and sends **Connect Snappy** → `{SNAPPY_PUBLIC_URL}/telegram/connect?token=…`.
3. User signs in with the **existing Snappy passcode** flow (`/login?returnTo=…`).
4. User confirms on `/telegram/connect`; the server calls `POST /api/telegram/link` with the token.
5. A row in `telegram_accounts` links `telegramUserId` ↔ `userId` (both unique).

No automatic matching by Telegram username. No bot token in URLs. Expired or reused tokens are rejected.

**Disconnect:** Profile → **Disconnect Telegram** (authenticated web action only).

## Upload flow

1. Linked user sends `/upload`.
2. Bot loads the linked user's active Snappy friends and shows inline recipient buttons; typed friend names are also supported.
3. The selected recipient's database user ID is stored in the chat-scoped Telegram state. The bot then waits for a photo.
4. User sends a **photo** (largest Telegram size), optionally with a **Telegram caption** on the same message.
5. Server revalidates that the stored recipient is still an allowed friend, downloads via **Telegram Bot API** (`getFile` + official file URL), validates bytes (max **10 MB**, JPEG/PNG/WebP/GIF — same as web uploader), runs the shared `lib/image-optimization.ts` pipeline (EXIF auto-orientation, proportional max 4096px resize, WebP quality 82), uploads the resulting WebP through **`lib/cloudinary-server-upload`**, and creates a Snap with `userId` equal to the selected friend and `uploadedById` equal to the linked Telegram user's Snappy ID.
5. If the photo message includes a caption, that text becomes the **Snappy Snap caption** (same max length rules as web; over-length captions are rejected with a friendly bot message).
6. Success message with **View Snap** (friend profile URL) and **Upload Another**.

Example:

```text
Telegram:  [photo] + caption "Beautiful sunset 🌅"
     ↓
Snappy:    same image, caption "Beautiful sunset 🌅"
```

**Not supported on Telegram yet:** video and documents (web uploader is images only). GIF inputs are accepted as raster images and stored as static WebP output.

The Telegram Mini App uses the same browser upload bridge as the web app: the original image goes to the authenticated `/api/cloudinary/optimize` endpoint, then the optimized WebP continues through the existing signed Cloudinary upload flow. Target selection uses the shared `FriendsPickerPanel` and the existing `/api/snaps` target-user model; no Telegram-specific Snap model or upload pipeline is created.

**Rate limit:** max **10 Telegram uploads per hour** per `telegramUserId` (`telegram_upload_logs`). Web uploads are unaffected.

## Find friends flow (bot)

Command: **`/find_friends`** (Telegram menu; **`/find-friends`** also works) — *View your friends' Snaps*.

Requires a linked Snappy account (same linking flow as upload). The bot resolves the Snappy user from **`telegram_accounts`**; it never asks for or trusts a client-supplied Snappy user ID.

### User flow

```text
/find_friends
      ↓
Friends list (actual friends for the linked user)
      ↓
User types friend's name
      ↓
First up to 3 Snaps (newest first)
      ↓
User types the same friend's name again
      ↓
Next up to 3 Snaps
      ↓
Continue 3 at a time until exhausted
```

### Friend search

- Search runs **only** among the authenticated user's friends (same canonical list as web home / users list: other **active** Snappy users).
- **Case-insensitive** matching; **partial** names match (e.g. `pyae` can match `Pyae Phyo`).
- If the typed text **exactly** matches one friend's full name, that friend is chosen even when partial matches would include others.
- **Multiple** partial matches → numbered list; user is asked to type the full name.
- **No match** → retry message; find-friends mode stays active.

### Pagination

- Page size: **`FIND_FRIENDS_SNAPS_PAGE_SIZE = 3`**.
- Snaps ordered **`createdAt` descending** (newest first, aligned with friend profile pages).
- First successful pick for a friend → Snaps **1–3**; typing the **same** resolved friend again → **4–6**, then **7–9**, etc.
- Typing a **different** friend's name → pagination **resets** to the first page for that friend.
- Per Telegram **chat**, the bot remembers the **selected friend** and **offset** until TTL expiry or state reset (see below).
- No more Snaps: completion message; friend with zero Snaps: empty-state message (no empty media).

### Media

- **One** Snap → single photo message (page footer in caption when applicable).
- **Two or three** Snaps → Telegram **media group** when sending succeeds; captions on individual items where supported, page footer on the last item.
- If media-group send fails, the bot falls back to sending photos individually and still sends the page footer text.

### Privacy and security

- Linked account only; no arbitrary Snappy user IDs or Snap IDs from the user.
- **No Snap codes** in this flow.
- Friend identity comes from server-side friend list + name match; Snap queries use the resolved friend user ID only.
- Snaps require an **active** owner; image URLs must pass existing **Telegram-safe** HTTPS checks (e.g. Cloudinary).
- Users cannot use `/find_friends` to search non-friends or arbitrary Snaps.

## Find Snap by code (Mini App only)

Snap code = existing **`Snap.id`** (cuid). Use the Mini App at **`/telegram/app/find`** or deep links with `screen=find` — not the bot.

## Conversation state

PostgreSQL table **`telegram_chat_states`**, keyed by Telegram **chat ID**.

| Mode | Purpose |
| --- | --- |
| `find_friends` | Awaiting friend name; stores selected friend + pagination offset for find-friends |
| `upload_target` | Choosing the friend who will receive the Snap |
| `upload_snap_target:<userId>` | Awaiting photo for the validated selected friend |

`/start`, `/help`, and unknown `/` commands **clear** state. `/find_friends` (or `/find-friends`) and `/upload` set their modes. While in find-friends mode, plain text (non-command) is treated as a friend name search. While in `upload_target`, plain text is matched only against the linked user's active friends. The selected target is revalidated again when the photo arrives.

States expire after **`TELEGRAM_CHAT_STATE_TTL_MS`** (15 minutes) based on `updatedAt`, same as before.

Deploy note: find-friends pagination uses columns `findFriendsFriendId` and `findFriendsOffset` — apply migration **`20260918180000_telegram_find_friends_state`** before relying on pagination in production.

## Environment variables

Server-only (never `NEXT_PUBLIC_` for secrets):

| Variable | Required (prod) | Purpose |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | Yes | Bot API + Mini App initData HMAC |
| `TELEGRAM_WEBHOOK_SECRET` | Yes | Webhook header validation (1–256 chars, `[A-Za-z0-9_-]`) |
| `SNAPPY_PUBLIC_URL` | Yes | HTTPS origin for Mini App, connect links, menu button |
| `TELEGRAM_WEBHOOK_URL` | Optional | Full webhook URL; defaults to `${SNAPPY_PUBLIC_URL}/api/telegram/webhook` |
| `TELEGRAM_BOT_USERNAME` | Recommended | Public `@username` for Mini App → bot links (no secret) |
| `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS` | Optional | initData freshness (default 3600) |
| `DATABASE_URL` | Yes | Includes telegram_* tables |
| Cloudinary vars | Yes (upload) | Same as web uploads |

### Production deployment checklist

1. Set env vars above on Vercel (never `NEXT_PUBLIC_` for bot token or webhook secret).
2. `npx prisma migrate deploy`
3. `npm run telegram:setup` from a machine with env loaded (registers webhook, commands, menu button).
4. Run Telegram test scripts (below).
5. `npm run telegram:verify-production` (webhook + HTTPS probes; no secrets printed).
6. Complete [telegram-release-checklist.md](./telegram-release-checklist.md) in a real Telegram client.

## Migrations

After deploy:

```bash
npx prisma migrate deploy
```

Required migrations include: `telegram_chat_states`, `telegram_accounts`, `telegram_link_challenges`, `telegram_upload_logs`, and **`20260918180000_telegram_find_friends_state`** (adds `findFriendsFriendId`, `findFriendsOffset` on `telegram_chat_states`).

## Tests

```bash
npm run test:telegram-find-friends
npm run test:telegram-find
npm run test:telegram-upload
npm run test:telegram-mini-app
npm run test:telegram-mini-app-home
npm run test:telegram-mini-app-find
npm run test:telegram-mini-app-upload
npm run test:telegram-mini-app-profile
npm run test:telegram-mini-app-integration
npm run test:telegram-hardening
```

## Shared components and APIs

The Mini App reuses `RecentSnaps`, `SnapGallery`, `SnapViewer`, `SnapCameraCapture`, `SnapCreateComposerModal`, `BottomNavCameraFlow`, `FriendsPickerPanel`, `NotificationsPageClient`, `ProfilePageClient`, `snap-upload-client`, `/api/snaps`, `/api/users/list`, `/api/notifications`, `/api/cloudinary/optimize`, and `/api/cloudinary/sign`. No database migrations or new dependencies are required for parity.

## Deferred (post T6)

- Telegram MainButton flows
- Video uploads (until web Snap pipeline supports them)
- Per-snap public deep links beyond Find (bot uses `/friends/{username}` like share menu)
