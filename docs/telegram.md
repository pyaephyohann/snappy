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
| `/start` | Welcome message plus Find / Upload / Mini App / web buttons |
| `/help` | Lists commands; clears conversation state |
| `/find` | Prompts for a Snap code, then looks up the Snap |
| `/upload` | Connect Snappy (if needed), then upload a photo Snap |

The bot menu button **📱 Open Snappy** (configured by `npm run telegram:setup`) opens the Mini App at `/telegram/app` when `SNAPPY_PUBLIC_URL` is set.

## Telegram Mini App

Route: **`/telegram/app`** (full URL: `{SNAPPY_PUBLIC_URL}/telegram/app`).

### Navigation (T4.2)

| Route | Purpose |
| --- | --- |
| `/telegram/app` | Home — recent Snaps (same data as web home via `loadRecentSnapsForHome`) |
| `/telegram/app/find` | Native Find Snap (T2 lookup + in-app `SnapViewer`) |
| `/telegram/app/upload` | Native image upload (Cloudinary sign + session-owned Snap create) |
| `/telegram/app/profile` | Account info, Snap count, Telegram connect/disconnect, **Open Full Profile** |

Bottom navigation is fixed with `env(safe-area-inset-bottom)`. Nested routes show Telegram **BackButton** (returns to home). Optional deep-link hint: `/telegram/app?screen=find` redirects to the Find tab.

PWA install prompt and service worker registration are skipped under `/telegram/app/*`.

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
2. Bot sets `telegram_chat_states.awaitingMode = upload_snap` (15-minute TTL).
3. User sends a **photo** (largest Telegram size).
4. Server downloads via **Telegram Bot API** (`getFile` + official file URL), validates bytes (max **10 MB**, JPEG/PNG/WebP/GIF — same as web uploader), uploads through **`lib/cloudinary-server-upload`**, creates a Snap via **`lib/snap-create-service`** owned by the linked user.
5. Success message with **View Snap** (friend profile URL) and **Upload Another**.

**Not supported on Telegram yet:** video and documents (web uploader is images only).

**Rate limit:** max **10 Telegram uploads per hour** per `telegramUserId` (`telegram_upload_logs`). Web uploads are unaffected.

## Find flow (T2)

Snap code = existing **`Snap.id`** (cuid). State: `find_snap` in `telegram_chat_states`.

## Conversation state

Modes: `find_snap`, `upload_snap` in PostgreSQL (`telegram_chat_states`). `/start`, `/help`, and unknown commands clear state. `/find` and `/upload` switch modes. States expire after 15 minutes.

## Environment variables

Server-only (never `NEXT_PUBLIC_` for secrets):

| Variable | Purpose |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Bot API + Mini App initData HMAC |
| `TELEGRAM_WEBHOOK_SECRET` | Webhook validation |
| `SNAPPY_PUBLIC_URL` | Connect, View Snap, Mini App, menu button |
| `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS` | Optional initData freshness (default 3600) |
| `DATABASE_URL` | Includes telegram_* tables |
| Cloudinary vars | Same as web uploads |

## Migrations

After deploy:

```bash
npx prisma migrate deploy
```

Required migrations: `telegram_chat_states`, `telegram_accounts`, `telegram_link_challenges`, `telegram_upload_logs`.

## Tests

```bash
npm run test:telegram-find
npm run test:telegram-upload
npm run test:telegram-mini-app
npm run test:telegram-mini-app-home
```

## Deferred (post T4.2)

- Mini App Find / Upload / full profile screens
- Telegram MainButton flows
- Video uploads (until web Snap pipeline supports them)
- Per-snap public deep links (bot uses `/friends/{username}` like share menu)
