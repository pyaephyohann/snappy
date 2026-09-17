import type { Context } from "grammy";

export type TelegramIdentity = {
  telegramUserId: string;
  telegramUsername: string | null;
  chatId: string | null;
};

export function getTelegramIdentity(ctx: Context): TelegramIdentity | null {
  const from = ctx.from;
  if (!from) {
    return null;
  }
  return {
    telegramUserId: String(from.id),
    telegramUsername: from.username ?? null,
    chatId: ctx.chat?.id === undefined ? null : String(ctx.chat.id),
  };
}
