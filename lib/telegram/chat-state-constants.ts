export const TELEGRAM_AWAITING_FIND_FRIENDS = "find_friends" as const;
export const TELEGRAM_AWAITING_UPLOAD = "upload_snap" as const;

export type TelegramAwaitingMode =
  | typeof TELEGRAM_AWAITING_FIND_FRIENDS
  | typeof TELEGRAM_AWAITING_UPLOAD;

export const TELEGRAM_CHAT_STATE_TTL_MS = 15 * 60 * 1000;
