import { prisma } from "@/lib/prisma";
import {
  TELEGRAM_AWAITING_FIND_FRIENDS,
  TELEGRAM_AWAITING_UPLOAD_TARGET,
  TELEGRAM_AWAITING_UPLOAD,
  TELEGRAM_UPLOAD_TARGET_MODE_PREFIX,
  TELEGRAM_CHAT_STATE_TTL_MS,
  type TelegramAwaitingMode,
} from "./chat-state-constants";

export {
  TELEGRAM_AWAITING_FIND_FRIENDS,
  TELEGRAM_AWAITING_UPLOAD_TARGET,
  TELEGRAM_AWAITING_UPLOAD,
  TELEGRAM_UPLOAD_TARGET_MODE_PREFIX,
  TELEGRAM_CHAT_STATE_TTL_MS,
  getTelegramUserStateKey,
} from "./chat-state-constants";

function isExpired(updatedAt: Date, now = Date.now()): boolean {
  return now - updatedAt.getTime() > TELEGRAM_CHAT_STATE_TTL_MS;
}

export type TelegramFindFriendsState = {
  friendId: string | null;
  offset: number;
};

export async function setTelegramAwaitingMode(
  chatId: string,
  mode: TelegramAwaitingMode,
): Promise<void> {
  await prisma.telegramChatState.upsert({
    where: { chatId },
    create: { chatId, awaitingMode: mode },
    update: { awaitingMode: mode },
  });
}

export async function clearTelegramChatState(chatId: string): Promise<void> {
  await prisma.telegramChatState.deleteMany({
    where: { chatId },
  });
}

export async function getTelegramAwaitingMode(
  chatId: string,
): Promise<TelegramAwaitingMode | null> {
  const row = await prisma.telegramChatState.findUnique({
    where: { chatId },
    select: { awaitingMode: true, updatedAt: true },
  });
  if (!row?.awaitingMode) {
    return null;
  }
  if (isExpired(row.updatedAt)) {
    await clearTelegramChatState(chatId);
    return null;
  }
  if (row.awaitingMode.startsWith(TELEGRAM_UPLOAD_TARGET_MODE_PREFIX)) {
    return TELEGRAM_AWAITING_UPLOAD;
  }
  if (row.awaitingMode === TELEGRAM_AWAITING_FIND_FRIENDS) {
    return TELEGRAM_AWAITING_FIND_FRIENDS;
  }
  if (row.awaitingMode === TELEGRAM_AWAITING_UPLOAD_TARGET) {
    return TELEGRAM_AWAITING_UPLOAD_TARGET;
  }
  if (row.awaitingMode === TELEGRAM_AWAITING_UPLOAD) {
    return TELEGRAM_AWAITING_UPLOAD;
  }
  return null;
}

export async function beginFindFriendsBrowse(chatId: string): Promise<void> {
  await prisma.telegramChatState.upsert({
    where: { chatId },
    create: {
      chatId,
      awaitingMode: TELEGRAM_AWAITING_FIND_FRIENDS,
      findFriendsFriendId: null,
      findFriendsOffset: 0,
    },
    update: {
      awaitingMode: TELEGRAM_AWAITING_FIND_FRIENDS,
      findFriendsFriendId: null,
      findFriendsOffset: 0,
    },
  });
}

export async function isAwaitingFindFriends(chatId: string): Promise<boolean> {
  return (await getTelegramAwaitingMode(chatId)) === TELEGRAM_AWAITING_FIND_FRIENDS;
}

export async function getFindFriendsState(
  chatId: string,
): Promise<TelegramFindFriendsState | null> {
  const row = await prisma.telegramChatState.findUnique({
    where: { chatId },
    select: {
      awaitingMode: true,
      findFriendsFriendId: true,
      findFriendsOffset: true,
      updatedAt: true,
    },
  });
  if (!row || row.awaitingMode !== TELEGRAM_AWAITING_FIND_FRIENDS) {
    return null;
  }
  if (isExpired(row.updatedAt)) {
    await clearTelegramChatState(chatId);
    return null;
  }
  return {
    friendId: row.findFriendsFriendId,
    offset: row.findFriendsOffset ?? 0,
  };
}

export async function setFindFriendsPagination(
  chatId: string,
  friendId: string,
  offset: number,
): Promise<void> {
  await prisma.telegramChatState.upsert({
    where: { chatId },
    create: {
      chatId,
      awaitingMode: TELEGRAM_AWAITING_FIND_FRIENDS,
      findFriendsFriendId: friendId,
      findFriendsOffset: offset,
    },
    update: {
      awaitingMode: TELEGRAM_AWAITING_FIND_FRIENDS,
      findFriendsFriendId: friendId,
      findFriendsOffset: offset,
    },
  });
}

export async function setAwaitingUploadTarget(chatId: string): Promise<void> {
  await setTelegramAwaitingMode(chatId, TELEGRAM_AWAITING_UPLOAD_TARGET);
}

export async function isAwaitingUploadTarget(chatId: string): Promise<boolean> {
  return (
    (await getTelegramAwaitingMode(chatId)) === TELEGRAM_AWAITING_UPLOAD_TARGET
  );
}

/** Stores the selected target in the existing chat-scoped state row. */
export async function setAwaitingSnapUploadForTarget(
  chatId: string,
  targetUserId: string,
): Promise<void> {
  if (!targetUserId || targetUserId.includes(":")) {
    throw new Error("Invalid Telegram upload target");
  }
  await setTelegramAwaitingMode(
    chatId,
    `${TELEGRAM_UPLOAD_TARGET_MODE_PREFIX}${targetUserId}`,
  );
}

export async function getAwaitingSnapUploadTarget(
  chatId: string,
): Promise<string | null> {
  const row = await prisma.telegramChatState.findUnique({
    where: { chatId },
    select: { awaitingMode: true, updatedAt: true },
  });
  if (!row || isExpired(row.updatedAt)) {
    if (row) await clearTelegramChatState(chatId);
    return null;
  }
  if (!row.awaitingMode?.startsWith(TELEGRAM_UPLOAD_TARGET_MODE_PREFIX)) {
    return null;
  }
  const targetUserId = row.awaitingMode.slice(
    TELEGRAM_UPLOAD_TARGET_MODE_PREFIX.length,
  );
  return targetUserId || null;
}

export async function setAwaitingSnapUpload(chatId: string): Promise<void> {
  await setTelegramAwaitingMode(chatId, TELEGRAM_AWAITING_UPLOAD);
}

export async function isAwaitingSnapUpload(chatId: string): Promise<boolean> {
  return (await getTelegramAwaitingMode(chatId)) === TELEGRAM_AWAITING_UPLOAD;
}
