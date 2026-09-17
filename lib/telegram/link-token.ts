import crypto from "crypto";

export const TELEGRAM_LINK_TOKEN_BYTES = 32;
export const TELEGRAM_LINK_TTL_MS = 15 * 60 * 1000;

export function generateTelegramLinkToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(TELEGRAM_LINK_TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: hashTelegramLinkToken(token) };
}

export function hashTelegramLinkToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function isLinkTokenFormatValid(token: string): boolean {
  if (!token || token.length < 32 || token.length > 128) {
    return false;
  }
  return /^[A-Za-z0-9_-]+$/.test(token);
}

export function isLinkChallengeExpired(expiresAt: Date, now = Date.now()): boolean {
  return expiresAt.getTime() <= now;
}
