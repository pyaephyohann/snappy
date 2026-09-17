/**
 * Server-only Telegram environment accessors.
 * Never import this module from client components.
 */

const WEBHOOK_SECRET_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

export function getTelegramBotToken(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return token ? token : null;
}

export function requireTelegramBotToken(): string {
  const token = getTelegramBotToken();
  if (!token) {
    throw new Error("[TELEGRAM] TELEGRAM_BOT_TOKEN is not set");
  }
  return token;
}

export function getTelegramWebhookSecret(): string | null {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return null;
  }
  if (!WEBHOOK_SECRET_PATTERN.test(secret)) {
    console.error(
      "[TELEGRAM] TELEGRAM_WEBHOOK_SECRET must be 1-256 characters matching [A-Za-z0-9_-]",
    );
    return null;
  }
  return secret;
}

export function isTelegramWebhookConfigured(): boolean {
  return Boolean(getTelegramBotToken() && getTelegramWebhookSecret());
}
