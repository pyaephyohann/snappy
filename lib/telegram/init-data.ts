import crypto from "crypto";

export const DEFAULT_TELEGRAM_INIT_DATA_MAX_AGE_SECONDS = 3600;

export type VerifiedTelegramWebAppUser = {
  telegramUserId: string;
  username: string | null;
  firstName: string;
  authDate: number;
};

export type InitDataValidationResult =
  | { ok: true; user: VerifiedTelegramWebAppUser }
  | {
      ok: false;
      reason:
        | "missing"
        | "malformed"
        | "missing_hash"
        | "invalid_signature"
        | "expired"
        | "missing_user"
        | "invalid_user";
    };

export function getTelegramInitDataMaxAgeSeconds(): number {
  const raw = process.env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS?.trim();
  if (!raw) {
    return DEFAULT_TELEGRAM_INIT_DATA_MAX_AGE_SECONDS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 60 || parsed > 86_400) {
    return DEFAULT_TELEGRAM_INIT_DATA_MAX_AGE_SECONDS;
  }
  return Math.floor(parsed);
}

/**
 * Validates Telegram Mini App initData per Telegram WebApp documentation.
 * @see https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateTelegramInitData(
  initData: string,
  botToken: string,
  options?: { maxAgeSeconds?: number; nowSeconds?: number },
): InitDataValidationResult {
  if (!initData.trim()) {
    return { ok: false, reason: "missing" };
  }
  if (!botToken.trim()) {
    return { ok: false, reason: "malformed" };
  }

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const hash = params.get("hash");
  if (!hash) {
    return { ok: false, reason: "missing_hash" };
  }

  const dataCheckString = buildInitDataCheckString(params);
  const expectedHash = computeInitDataHash(dataCheckString, botToken);
  if (!timingSafeEqualHex(expectedHash, hash)) {
    return { ok: false, reason: "invalid_signature" };
  }

  const authDateRaw = params.get("auth_date");
  const authDate = authDateRaw ? Number(authDateRaw) : NaN;
  if (!Number.isFinite(authDate) || authDate <= 0) {
    return { ok: false, reason: "malformed" };
  }

  const maxAge = options?.maxAgeSeconds ?? DEFAULT_TELEGRAM_INIT_DATA_MAX_AGE_SECONDS;
  const now = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (authDate > now + 60) {
    return { ok: false, reason: "expired" };
  }
  if (now - authDate > maxAge) {
    return { ok: false, reason: "expired" };
  }

  const userRaw = params.get("user");
  if (!userRaw) {
    return { ok: false, reason: "missing_user" };
  }

  let userJson: unknown;
  try {
    userJson = JSON.parse(userRaw);
  } catch {
    return { ok: false, reason: "invalid_user" };
  }

  if (typeof userJson !== "object" || userJson === null) {
    return { ok: false, reason: "invalid_user" };
  }

  const id = (userJson as { id?: unknown }).id;
  const firstName = (userJson as { first_name?: unknown }).first_name;
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
    return { ok: false, reason: "invalid_user" };
  }
  if (typeof firstName !== "string" || !firstName.trim()) {
    return { ok: false, reason: "invalid_user" };
  }

  const username = (userJson as { username?: unknown }).username;
  return {
    ok: true,
    user: {
      telegramUserId: String(id),
      username: typeof username === "string" && username.length > 0 ? username : null,
      firstName: firstName.trim(),
      authDate,
    },
  };
}

export function buildInitDataCheckString(params: URLSearchParams): string {
  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key === "hash") {
      return;
    }
    pairs.push(`${key}=${value}`);
  });
  pairs.sort();
  return pairs.join("\n");
}

export function computeInitDataHash(
  dataCheckString: string,
  botToken: string,
): string {
  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  return crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a, "hex");
    const bBuf = Buffer.from(b, "hex");
    if (aBuf.length !== bBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}
