import { prisma } from "@/lib/prisma";
import {
  TELEGRAM_AWAITING_FIND,
  TELEGRAM_CHAT_STATE_TTL_MS,
} from "./chat-state-constants";

export { TELEGRAM_AWAITING_FIND, TELEGRAM_CHAT_STATE_TTL_MS } from "./chat-state-constants";

function isExpired(updatedAt: Date, now = Date.now()): boolean {
  return now - updatedAt.getTime() > TELEGRAM_CHAT_STATE_TTL_MS;
}

export async function setAwaitingSnapCode(chatId: string): Promise<void> {
  await prisma.telegramChatState.upsert({
    where: { chatId },
    create: {
      chatId,
      awaitingMode: TELEGRAM_AWAITING_FIND,
    },
    update: {
      awaitingMode: TELEGRAM_AWAITING_FIND,
    },
  });
}

export async function clearTelegramChatState(chatId: string): Promise<void> {
  await prisma.telegramChatState.deleteMany({
    where: { chatId },
  });
}

export async function isAwaitingSnapCode(chatId: string): Promise<boolean> {
  const row = await prisma.telegramChatState.findUnique({
    where: { chatId },
    select: { awaitingMode: true, updatedAt: true },
  });
  if (!row || row.awaitingMode !== TELEGRAM_AWAITING_FIND) {
    return false;
  }
  if (isExpired(row.updatedAt)) {
    await clearTelegramChatState(chatId);
    return false;
  }
  return true;
}
