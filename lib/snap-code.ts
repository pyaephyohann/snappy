/**
 * Snappy uses Prisma cuid() Snap IDs as the user-facing "Snap code"
 * (same identifier used in /api/snaps and admin APIs).
 */

/** Max length before we reject input without hitting the database. */
export const SNAP_LOOKUP_CODE_MAX_LENGTH = 64;

/** Typical cuid() ids from Prisma — lowercase alphanumeric, often starting with "c". */
const SNAP_ID_PATTERN = /^c[a-z0-9]{8,48}$/i;

export type SnapCodeValidationResult =
  | { ok: true; code: string }
  | { ok: false; reason: "empty" | "invalid_format" | "too_long" };

export function normalizeSnapLookupCode(raw: string): SnapCodeValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, reason: "empty" };
  }
  if (trimmed.length > SNAP_LOOKUP_CODE_MAX_LENGTH) {
    return { ok: false, reason: "too_long" };
  }
  const code = trimmed.toLowerCase();
  if (!SNAP_ID_PATTERN.test(code)) {
    return { ok: false, reason: "invalid_format" };
  }
  return { ok: true, code };
}

export function isTelegramCommandText(text: string): boolean {
  return text.trim().startsWith("/");
}
