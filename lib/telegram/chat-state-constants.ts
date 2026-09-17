export const TELEGRAM_AWAITING_FIND = "find_snap" as const;
export const TELEGRAM_AWAITING_UPLOAD = "upload_snap" as const;

export type TelegramAwaitingMode =
  | typeof TELEGRAM_AWAITING_FIND
  | typeof TELEGRAM_AWAITING_UPLOAD;

/** Drop stale conversation sessions after this long. */
export const TELEGRAM_CHAT_STATE_TTL_MS = 15 * 60 * 1000;
