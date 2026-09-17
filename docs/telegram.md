# Snappy Telegram bot

Telegram talks to the existing Next.js app over a webhook. The bot does **not** use a second database, upload pipeline, or data model. Find and upload remain placeholders until later milestones.

```
Telegram → POST /api/telegram/webhook → lib/telegram → existing Snappy services (later milestones)
```

## Supported commands

| Command | Behavior |
| --- | --- |
| `/start` | Welcome message plus Find / Upload / Open Snappy buttons |
| `/help` | Lists commands |
| `/find` | Placeholder: search is not implemented yet |
| `/upload` | Placeholder: Telegram uploads are not implemented yet |

The Find and Upload inline buttons currently send the same placeholder replies.

## Deferred to later milestones

- Telegram ↔ Snappy account linking
- Real snap search from `/find`
- Real snap upload from `/upload` (Cloudinary + Prisma)
- Notifications or other product features through Telegram

## Environment variables

Set these on the server only (Vercel project env, `.env.local`). Do not prefix them with `NEXT_PUBLIC_`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Yes for production webhook | 1–256 chars matching `[A-Za-z0-9_-]`. Sent as Telegram `secret_token` and checked on every webhook request |
| `SNAPPY_PUBLIC_URL` | Recommended | Existing HTTPS origin for the **Open Snappy** button, e.g. `https://your-snappy-domain`. If unset, production uses Vercel’s `VERCEL_PROJECT_PRODUCTION_URL` when present. No domain is invented. |
| `TELEGRAM_WEBHOOK_URL` | Optional | Full webhook URL. Defaults to `${SNAPPY_PUBLIC_URL}/api/telegram/webhook` |

## Create the bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather).
2. Run `/newbot` and follow the prompts.
3. Copy the bot token into `TELEGRAM_BOT_TOKEN`. Never commit it.
4. Optionally run `/setprivacy` (disable privacy if later milestones need group content) and `/setcommands`:

```
start - Introduce Snappy
help - Show available commands
find - Find a Snap (coming soon)
upload - Upload a Snap (coming soon)
```

5. Generate a webhook secret (example: `openssl rand -hex 32`) and set `TELEGRAM_WEBHOOK_SECRET`.

## Production webhook

Snappy is a Vercel web app, so Telegram delivers updates to:

```
https://<your-snappy-host>/api/telegram/webhook
```

1. Deploy with `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` set in Vercel.
2. Set `SNAPPY_PUBLIC_URL` to the existing production HTTPS origin if it is not already the Vercel production host.
3. From a machine that has those env vars:

```bash
npm run telegram:setup
```

This calls Telegram `setWebhook` with `secret_token` and registers the bot commands. It does not print the bot token.

You can also configure the webhook with curl (the token stays in your shell, not in the repo):

```bash
curl -sS -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"$SNAPPY_PUBLIC_URL/api/telegram/webhook\",\"secret_token\":\"$TELEGRAM_WEBHOOK_SECRET\",\"allowed_updates\":[\"message\",\"callback_query\"]}"
```

Confirm with:

```bash
curl -sS "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

The app validates `X-Telegram-Bot-Api-Secret-Token`, rejects oversized/malformed bodies, and does not expose internals on failure.

## Local testing

Production should keep using the webhook. For local command checks you can poll:

```bash
# .env.local must contain TELEGRAM_BOT_TOKEN
npm run telegram:dev
```

Then message the bot `/start`, `/help`, `/find`, and `/upload`.

Notes:

- Long polling is development-only. It will take over the bot’s update stream, so pause it before pointing Telegram back at production (`npm run telegram:setup`).
- To test the webhook itself locally, expose `http://localhost:3000` with a tunnel and set `TELEGRAM_WEBHOOK_URL` to `https://<tunnel>/api/telegram/webhook`, then run `npm run telegram:setup` and `npm run dev`.
