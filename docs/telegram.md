# Snappy Telegram bot

Telegram talks to the existing Next.js app over a webhook. The bot uses the same PostgreSQL database and Snap model as the web app.

```
Telegram → POST /api/telegram/webhook → lib/telegram → lib/snap-lookup → Prisma
```

## Supported commands

| Command | Behavior |
| --- | --- |
| `/start` | Welcome message plus Find / Upload / Open Snappy buttons |
| `/help` | Lists commands (clears any in-progress find flow) |
| `/find` | Prompts for a Snap code, then looks up the Snap |
| `/upload` | Placeholder: Telegram uploads are not implemented yet |

The **Find Snap** inline button starts the same flow as `/find`.

## Snap codes

Snappy’s Snap code is the existing **`Snap.id`** value (Prisma `cuid()`), the same identifier used by Snappy API routes and admin tools. There is no separate `SNAP-…` format.

## Find flow and conversation state

1. User sends `/find` (or taps **Find Snap**).
2. Bot asks for the Snap code.
3. User sends the code in the next message.
4. Bot replies with a preview (when possible), creator, date, and **View Snap** / **Find Another**.

Because Snappy runs on serverless Vercel, find mode is stored in PostgreSQL (`telegram_chat_states`), not in memory or Redis. Rows expire after 15 minutes of inactivity. Sending `/start`, `/help`, or `/upload` clears find mode so users are not stuck waiting.

## View Snap URL

**View Snap** opens the same destination as in-app sharing: the friend profile path `/friends/{username}` on your configured HTTPS origin (`SNAPPY_PUBLIC_URL` or Vercel production host). Snappy still requires login in the browser; the bot does not bypass session middleware.

## Privacy

Telegram find uses the same discoverability rule as the in-app friend profile: the Snap must exist, the owner must be **active** (`User.isActive`), and preview images must be HTTPS Cloudinary URLs already stored on the Snap. Inactive owners or invalid image hosts are treated as **not found** (no metadata leak).

## Deferred to later milestones

- Telegram ↔ Snappy account linking
- Telegram upload from `/upload` (Cloudinary + Prisma)
- Per-snap deep links (if the web app adds them)
- Notifications or other product features through Telegram

## Environment variables

Set these on the server only (Vercel project env, `.env.local`). Do not prefix them with `NEXT_PUBLIC_`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Yes for production webhook | 1–256 chars matching `[A-Za-z0-9_-]`. Sent as Telegram `secret_token` and checked on every webhook request |
| `SNAPPY_PUBLIC_URL` | Recommended | HTTPS origin for **Open Snappy** and **View Snap**, e.g. `https://your-snappy-domain`. If unset, production uses Vercel’s `VERCEL_PROJECT_PRODUCTION_URL` when present. No domain is invented. |
| `TELEGRAM_WEBHOOK_URL` | Optional | Full webhook URL. Defaults to `${SNAPPY_PUBLIC_URL}/api/telegram/webhook` |
| `DATABASE_URL` | Yes | Must include the `telegram_chat_states` table (run Prisma migrations after deploy) |

## Database migration

After deploying T2, apply migrations so find mode can persist:

```bash
npx prisma migrate deploy
```

## Create the bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather).
2. Run `/newbot` and follow the prompts.
3. Copy the bot token into `TELEGRAM_BOT_TOKEN`. Never commit it.
4. Optionally run `/setcommands`:

```
start - Introduce Snappy
help - Show available commands
find - Find a Snap by code
upload - Upload a Snap (coming soon)
```

5. Generate a webhook secret (example: `openssl rand -hex 32`) and set `TELEGRAM_WEBHOOK_SECRET`.

## Production webhook

Snappy is a Vercel web app, so Telegram delivers updates to:

```
https://<your-snappy-host>/api/telegram/webhook
```

1. Deploy with env vars set in Vercel.
2. Run `npx prisma migrate deploy` against production `DATABASE_URL`.
3. From a machine that has the Telegram env vars:

```bash
npm run telegram:setup
```

## Local testing

```bash
npm run test:telegram-find
npm run telegram:dev   # requires TELEGRAM_BOT_TOKEN in .env.local
```

Then try `/find`, paste a real Snap `id`, and confirm `/help` still works while waiting for a code.

## Tests

```bash
npm run test:telegram-find
```

Covers Snap code normalization, privacy helpers, URL building, and message formatting.
