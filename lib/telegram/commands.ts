import type { Bot, Context } from "grammy";
import {
  buildMainKeyboard,
  isTelegramCallbackAction,
  TELEGRAM_CALLBACK,
} from "./keyboards";
import {
  beginFindSnapFlow,
  clearFindSnapFlow,
  handleFindSnapCodeMessage,
} from "./find-snap";
import {
  HELP_MESSAGE,
  START_MESSAGE,
  UNKNOWN_COMMAND_MESSAGE,
  UPLOAD_MESSAGE,
} from "./messages";

export const TELEGRAM_BOT_COMMANDS = [
  { command: "start", description: "Introduce Snappy" },
  { command: "help", description: "Show available commands" },
  { command: "find", description: "Find a Snap by code" },
  { command: "upload", description: "Upload a Snap (coming soon)" },
] as const;

export function registerTelegramHandlers(bot: Bot): void {
  bot.command("start", async (ctx) => {
    await clearFindSnapFlow(getChatId(ctx));
    await replyWithMainKeyboard(ctx, START_MESSAGE);
  });

  bot.command("help", async (ctx) => {
    await clearFindSnapFlow(getChatId(ctx));
    await replyWithMainKeyboard(ctx, HELP_MESSAGE);
  });

  bot.command("find", async (ctx) => {
    await beginFindSnapFlow(ctx);
  });

  bot.command("upload", async (ctx) => {
    await clearFindSnapFlow(getChatId(ctx));
    await ctx.reply(UPLOAD_MESSAGE);
  });

  bot.callbackQuery(TELEGRAM_CALLBACK.find, async (ctx) => {
    await ctx.answerCallbackQuery();
    await beginFindSnapFlow(ctx);
  });

  bot.callbackQuery(TELEGRAM_CALLBACK.upload, async (ctx) => {
    await ctx.answerCallbackQuery();
    await clearFindSnapFlow(getChatId(ctx));
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
    const handled = await handleFindSnapCodeMessage(ctx);
    if (handled) {
      return;
    }

    const text = ctx.message.text;
    if (!text.startsWith("/")) {
      return;
    }
    await clearFindSnapFlow(getChatId(ctx));
    await ctx.reply(UNKNOWN_COMMAND_MESSAGE);
  });
}

function replyWithMainKeyboard(ctx: Context, text: string) {
  return ctx.reply(text, { reply_markup: buildMainKeyboard() });
}

function getChatId(ctx: Context): string | null {
  const id = ctx.chat?.id;
  return id === undefined ? null : String(id);
}
