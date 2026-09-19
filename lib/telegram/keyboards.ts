import { InlineKeyboard } from "grammy";
import { buildTelegramMiniAppDeepLink } from "./mini-app-deep-link";
import { buildTelegramMiniAppUrl } from "./mini-app-url";
import { getSnappyPublicUrl } from "./public-url";

export const TELEGRAM_CALLBACK = {
  findFriends: "find_friends",
  upload: "upload",
  uploadTargetPrefix: "upload_target:",
} as const;

export type TelegramCallbackAction =
  | "find_friends"
  | "upload"
  | `${typeof TELEGRAM_CALLBACK.uploadTargetPrefix}${string}`;

export function buildUploadTargetCallback(targetUserId: string): string {
  return `${TELEGRAM_CALLBACK.uploadTargetPrefix}${targetUserId}`;
}

export function parseUploadTargetCallback(data: string): string | null {
  if (!data.startsWith(TELEGRAM_CALLBACK.uploadTargetPrefix)) {
    return null;
  }
  const targetUserId = data.slice(TELEGRAM_CALLBACK.uploadTargetPrefix.length);
  return targetUserId && !targetUserId.includes(":") ? targetUserId : null;
}

export function isTelegramCallbackAction(
  value: string,
): value is TelegramCallbackAction {
  return (
    value === TELEGRAM_CALLBACK.findFriends ||
    value === TELEGRAM_CALLBACK.upload ||
    parseUploadTargetCallback(value) !== null
  );
}

export function buildUploadTargetKeyboard(
  friends: { id: string; name: string }[],
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  friends.forEach((friend, index) => {
    keyboard.text(friend.name, buildUploadTargetCallback(friend.id));
    if (index % 2 === 1 || index === friends.length - 1) {
      keyboard.row();
    }
  });
  return keyboard;
}

export function buildMainKeyboard(
  publicUrl: string | null = getSnappyPublicUrl(),
): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text("👥 Find Friends", TELEGRAM_CALLBACK.findFriends)
    .text("📤 Upload Snap", TELEGRAM_CALLBACK.upload);

  const miniAppUrl = buildTelegramMiniAppUrl();
  if (miniAppUrl) {
    keyboard.row().webApp("📱 Open Snappy", miniAppUrl);
  }

  if (publicUrl) {
    keyboard.row().url("🌐 Open Snappy", publicUrl);
  }

  return keyboard;
}

export function appendMiniAppFindButton(
  keyboard: InlineKeyboard,
  snapCode?: string,
): InlineKeyboard {
  const url = buildTelegramMiniAppDeepLink({
    screen: "find",
    code: snapCode,
  });
  if (url) {
    keyboard.row().webApp("📱 Open Find in Snappy", url);
  }
  return keyboard;
}

export function buildMiniAppFindEntryKeyboard(
  snapCode?: string,
): InlineKeyboard | null {
  const url = buildTelegramMiniAppDeepLink({
    screen: "find",
    code: snapCode,
  });
  if (!url) {
    return null;
  }
  return new InlineKeyboard().webApp("📱 Open Find in Snappy", url);
}
