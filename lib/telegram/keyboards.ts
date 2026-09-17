import { InlineKeyboard } from "grammy";
import { getSnappyPublicUrl } from "./public-url";

export const TELEGRAM_CALLBACK = {
  find: "find",
  upload: "upload",
} as const;

export type TelegramCallbackAction =
  (typeof TELEGRAM_CALLBACK)[keyof typeof TELEGRAM_CALLBACK];

export function isTelegramCallbackAction(
  value: string,
): value is TelegramCallbackAction {
  return value === TELEGRAM_CALLBACK.find || value === TELEGRAM_CALLBACK.upload;
}

export function buildMainKeyboard(
  publicUrl: string | null = getSnappyPublicUrl(),
): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text("🔎 Find Snap", TELEGRAM_CALLBACK.find)
    .text("📤 Upload Snap", TELEGRAM_CALLBACK.upload);

  if (publicUrl) {
    keyboard.row().url("🌐 Open Snappy", publicUrl);
  }

  return keyboard;
}
