const BOT_TOKEN_IN_TEXT = /\d{6,}:[A-Za-z0-9_-]{20,}/g;

export function sanitizeTelegramError(error: unknown): string {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "unknown error";
  return message.replace(BOT_TOKEN_IN_TEXT, "<redacted-token>");
}
