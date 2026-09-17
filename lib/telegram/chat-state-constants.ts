export const TELEGRAM_AWAITING_FIND = "find_snap" as const;

/** Drop stale "waiting for code" sessions after this long. */
export const TELEGRAM_CHAT_STATE_TTL_MS = 15 * 60 * 1000;
