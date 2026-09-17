# Telegram production release checklist (T7)

Mark each item **PASS**, **FAIL**, or **NOT TESTED** only after you have actually verified it. Do not infer live success from automated tests alone.

## Configuration

| Item | Status |
| --- | --- |
| Production env: `TELEGRAM_BOT_TOKEN` | |
| Production env: `TELEGRAM_WEBHOOK_SECRET` | |
| Production env: `SNAPPY_PUBLIC_URL` (HTTPS) | |
| Production env: `TELEGRAM_WEBHOOK_URL` or derived webhook URL | |
| Production env: `TELEGRAM_BOT_USERNAME` (recommended) | |
| `npm run telegram:verify-production` (with env loaded) | |

## Webhook & bot

| Item | Status |
| --- | --- |
| Webhook URL → `https://<domain>/api/telegram/webhook` | |
| Telegram `getWebhookInfo` matches configured URL | |
| GET webhook returns 405; POST without secret returns 401 | |
| `/start`, `/help`, `/find`, `/upload` in real Telegram | |
| Unknown command fallback | |

## Mini App

| Item | Status |
| --- | --- |
| Menu **📱 Open Snappy** opens production Mini App | |
| Home / Find / Upload / Profile navigation | |
| initData → session (linked account) | |
| Connect / disconnect / reconnect linking | |
| Find (valid / invalid code, privacy rules) | |
| Upload (supported image, success, retry) | |
| Bot Find → **Open Find in Snappy** deep link | |
| Home/Find → bot links (`TELEGRAM_BOT_USERNAME`) | |
| Deep links (`?screen=…`, find + code) | |
| BackButton behavior | |
| Reconnect after session expiry (if reproducible) | |

## Automation & deploy

| Item | Status |
| --- | --- |
| All `npm run test:telegram-*` scripts | |
| `npm run typecheck` / `npm run lint` / `npm run build` | |
| Production logs reviewed (no secrets in output) | |

Run automated checks:

```bash
npm run telegram:verify-production   # requires .env.local with production vars
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
