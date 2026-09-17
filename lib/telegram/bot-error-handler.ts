import type { Bot } from "grammy";
import { sanitizeTelegramError } from "./errors";

export const TELEGRAM_BOT_USER_ERROR_MESSAGE =
  "Something went wrong. Please try again in a moment.";

export function registerTelegramBotErrorHandler(bot: Bot): void {
  bot.catch(async (err) => {
    console.error(
      "[TELEGRAM] Handler error",
      sanitizeTelegramError(err.error),
    );
    if (!err.ctx.chat) {
      return;
    }
    try {
      await err.ctx.reply(TELEGRAM_BOT_USER_ERROR_MESSAGE);
    } catch (replyError) {
      console.error(
        "[TELEGRAM] Failed to send error reply",
        sanitizeTelegramError(replyError),
      );
    }
  });
}
