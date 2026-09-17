# Snappy Telegram bot

Telegram talks to the existing Next.js app over a webhook. The bot uses the same PostgreSQL database, Cloudinary pipeline, and Snap model as the web app.

```
Telegram → POST /api/telegram/webhook → lib/telegram → lib/snap-* / Prisma
Web link  → /telegram/connect → POST /api/telegram/link (Snappy session)
```

## Supported commands

| Command | Behavior |
| --- | --- |
| `/start` | Welcome message plus Find / Upload / Open Snappy buttons |
| `/help` | Lists commands; clears conversation state |
| `/find` | Prompts for a Snap code, then looks up the Snap |
| `/upload` | Connect Snappy (if needed), then upload a photo Snap |

## Account linking (explicit)

Telegram identity is **`from.id`** (numeric Telegram user ID) from verified webhook updates — never from user-typed text. Usernames are stored for display only and can change.

1. User sends `/upload` without a link.
2. Bot creates a **single-use, short-lived** row in `telegram_link_challenges` and sends **Connect Snappy** → `{SNAPPY_PUBLIC_URL}/telegram/connect?token=…`.
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
| `TELEGRAM_BOT_TOKEN` | Bot API |
| `TELEGRAM_WEBHOOK_SECRET` | Webhook validation |
| `SNAPPY_PUBLIC_URL` | Connect + View Snap buttons |
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
```

## Deferred

- Telegram Mini App
- Video uploads (until web Snap pipeline supports them)
- Per-snap public deep links (bot uses `/friends/{username}` like share menu)
