const WINDOW_MS = 60_000;
const MAX_MUTATIONS = 30;
const attempts = new Map<string, { count: number; windowStartedAt: number }>();

/**
 * Best-effort per-instance protection for rapid follow mutations.
 * A shared external limiter can replace this when one is introduced globally.
 */
export function isSocialMutationRateLimited(key: string, now = Date.now()): boolean {
  const current = attempts.get(key);
  if (!current || now - current.windowStartedAt >= WINDOW_MS) {
    attempts.set(key, { count: 1, windowStartedAt: now });
    return false;
  }

  if (current.count >= MAX_MUTATIONS) {
    return true;
  }

  current.count += 1;
  return false;
}
