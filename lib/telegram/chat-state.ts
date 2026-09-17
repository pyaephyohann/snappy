import { prisma } from "@/lib/prisma";
import {
  TELEGRAM_AWAITING_FIND_FRIENDS,
  TELEGRAM_AWAITING_UPLOAD,
  TELEGRAM_CHAT_STATE_TTL_MS,
  type TelegramAwaitingMode,
} from "./chat-state-constants";

export {
  TELEGRAM_AWAITING_FIND_FRIENDS,
  TELEGRAM_AWAITING_UPLOAD,
  TELEGRAM_CHAT_STATE_TTL_MS,
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
  if (
    row.awaitingMode === TELEGRAM_AWAITING_FIND_FRIENDS ||
    row.awaitingMode === TELEGRAM_AWAITING_UPLOAD
  ) {
    return row.awaitingMode;
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

export async function setAwaitingSnapUpload(chatId: string): Promise<void> {
  await setTelegramAwaitingMode(chatId, TELEGRAM_AWAITING_UPLOAD);
}

export async function isAwaitingSnapUpload(chatId: string): Promise<boolean> {
  return (await getTelegramAwaitingMode(chatId)) === TELEGRAM_AWAITING_UPLOAD;
}
