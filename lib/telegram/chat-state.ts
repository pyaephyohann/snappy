import { prisma } from "@/lib/prisma";
import {
  TELEGRAM_AWAITING_FIND,
  TELEGRAM_AWAITING_UPLOAD,
  TELEGRAM_CHAT_STATE_TTL_MS,
  type TelegramAwaitingMode,
} from "./chat-state-constants";

export {
  TELEGRAM_AWAITING_FIND,
  TELEGRAM_AWAITING_UPLOAD,
  TELEGRAM_CHAT_STATE_TTL_MS,
} from "./chat-state-constants";

function isExpired(updatedAt: Date, now = Date.now()): boolean {
  return now - updatedAt.getTime() > TELEGRAM_CHAT_STATE_TTL_MS;
}

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
    row.awaitingMode === TELEGRAM_AWAITING_FIND ||
    row.awaitingMode === TELEGRAM_AWAITING_UPLOAD
  ) {
    return row.awaitingMode;
  }
  return null;
}

export async function setAwaitingSnapCode(chatId: string): Promise<void> {
  await setTelegramAwaitingMode(chatId, TELEGRAM_AWAITING_FIND);
}

export async function isAwaitingSnapCode(chatId: string): Promise<boolean> {
  return (await getTelegramAwaitingMode(chatId)) === TELEGRAM_AWAITING_FIND;
}

export async function setAwaitingSnapUpload(chatId: string): Promise<void> {
  await setTelegramAwaitingMode(chatId, TELEGRAM_AWAITING_UPLOAD);
}

export async function isAwaitingSnapUpload(chatId: string): Promise<boolean> {
  return (await getTelegramAwaitingMode(chatId)) === TELEGRAM_AWAITING_UPLOAD;
}
