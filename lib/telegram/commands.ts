import type { Bot, Context } from "grammy";
import {
  buildMainKeyboard,
  isTelegramCallbackAction,
  TELEGRAM_CALLBACK,
} from "./keyboards";
import {
  FIND_MESSAGE,
  HELP_MESSAGE,
  START_MESSAGE,
  UNKNOWN_COMMAND_MESSAGE,
  UPLOAD_MESSAGE,
} from "./messages";

export const TELEGRAM_BOT_COMMANDS = [
  { command: "start", description: "Introduce Snappy" },
  { command: "help", description: "Show available commands" },
  { command: "find", description: "Find a Snap (coming soon)" },
  { command: "upload", description: "Upload a Snap (coming soon)" },
] as const;

export function registerTelegramHandlers(bot: Bot): void {
  bot.command("start", (ctx) => replyWithMainKeyboard(ctx, START_MESSAGE));
  bot.command("help", (ctx) => replyWithMainKeyboard(ctx, HELP_MESSAGE));
  bot.command("find", (ctx) => ctx.reply(FIND_MESSAGE));
  bot.command("upload", (ctx) => ctx.reply(UPLOAD_MESSAGE));

  bot.callbackQuery(TELEGRAM_CALLBACK.find, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(FIND_MESSAGE);
  });

  bot.callbackQuery(TELEGRAM_CALLBACK.upload, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(UPLOAD_MESSAGE);
  });

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (isTelegramCallbackAction(data)) {
      return;
    }
    await ctx.answerCallbackQuery({ text: "Unknown action" });
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    if (!text.startsWith("/")) {
      return;
    }
    await ctx.reply(UNKNOWN_COMMAND_MESSAGE);
  });
}

function replyWithMainKeyboard(ctx: Context, text: string) {
  return ctx.reply(text, { reply_markup: buildMainKeyboard() });
}
