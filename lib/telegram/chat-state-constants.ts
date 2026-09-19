export const TELEGRAM_AWAITING_FIND_FRIENDS = "find_friends" as const;
export const TELEGRAM_AWAITING_UPLOAD_TARGET = "upload_target" as const;
export const TELEGRAM_AWAITING_UPLOAD = "upload_snap" as const;
export const TELEGRAM_UPLOAD_TARGET_MODE_PREFIX = "upload_snap_target:" as const;

export type TelegramAwaitingMode =
  | typeof TELEGRAM_AWAITING_FIND_FRIENDS
  | typeof TELEGRAM_AWAITING_UPLOAD_TARGET
  | typeof TELEGRAM_AWAITING_UPLOAD
  | `${typeof TELEGRAM_UPLOAD_TARGET_MODE_PREFIX}${string}`;

export function getTelegramUserStateKey(
  chatId: string,
  telegramUserId: string,
): string {
  return `${chatId}:${telegramUserId}`;
}

export const TELEGRAM_CHAT_STATE_TTL_MS = 15 * 60 * 1000;
