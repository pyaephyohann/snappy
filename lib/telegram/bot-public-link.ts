/**
 * Public Telegram bot link (no secrets). Username is configured explicitly.
 */
export function getTelegramBotPublicUrl(): string | null {
  const raw = process.env.TELEGRAM_BOT_USERNAME?.trim();
  if (!raw) {
    return null;
  }
  const username = raw.replace(/^@/, "");
  if (!/^[a-zA-Z0-9_]{4,32}$/.test(username)) {
    return null;
  }
  return `https://t.me/${username}`;
}

export function buildTelegramBotStartUrl(startPayload: string): string | null {
  const base = getTelegramBotPublicUrl();
  if (!base) {
    return null;
  }
  const payload = startPayload.trim();
  if (!payload || !/^[a-zA-Z0-9_-]{1,64}$/.test(payload)) {
    return base;
  }
  const url = new URL(base);
  url.searchParams.set("start", payload);
  return url.toString();
}
