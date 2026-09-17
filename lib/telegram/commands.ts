import type { Bot, Context } from "grammy";
import {
  buildMainKeyboard,
  isTelegramCallbackAction,
  TELEGRAM_CALLBACK,
} from "./keyboards";
import {
  beginFindFriendsFlow,
  handleFindFriendsNameMessage,
} from "./find-friends";
import { clearTelegramChatState } from "./chat-state";
import {
  beginUploadSnapFlow,
  handleTelegramPhotoMessage,
  handleAwaitingUploadNonPhotoMessage,
} from "./upload-snap";
import {
  HELP_MESSAGE,
  START_MESSAGE,
  UNKNOWN_COMMAND_MESSAGE,
} from "./messages";
import { registerTelegramBotErrorHandler } from "./bot-error-handler";

export const TELEGRAM_BOT_COMMANDS = [
  { command: "start", description: "Introduce Snappy" },
  { command: "help", description: "Show available commands" },
  {
    command: "find-friends",
    description: "View your friends' Snaps",
  },
  { command: "upload", description: "Upload a photo Snap" },
] as const;

export function registerTelegramHandlers(bot: Bot): void {
  bot.command("start", async (ctx) => {
    await clearTelegramChatStateForContext(ctx);
    const payload =
      ctx.message?.text?.split(/\s+/).slice(1).join(" ").trim().toLowerCase() ??
      "";
    if (payload === "find-friends" || payload === "findfriends") {
      await beginFindFriendsFlow(ctx);
      return;
    }
    if (payload === "upload") {
      await beginUploadSnapFlow(ctx);
      return;
    }
    await replyWithMainKeyboard(ctx, START_MESSAGE);
  });

  bot.command("help", async (ctx) => {
    await clearTelegramChatStateForContext(ctx);
    await replyWithMainKeyboard(ctx, HELP_MESSAGE);
  });

  bot.command("find-friends", async (ctx) => {
    await beginFindFriendsFlow(ctx);
  });

  bot.command("upload", async (ctx) => {
    await beginUploadSnapFlow(ctx);
  });

  bot.callbackQuery(TELEGRAM_CALLBACK.findFriends, async (ctx) => {
    await ctx.answerCallbackQuery();
    await beginFindFriendsFlow(ctx);
  });

  bot.callbackQuery(TELEGRAM_CALLBACK.upload, async (ctx) => {
    await ctx.answerCallbackQuery();
    await beginUploadSnapFlow(ctx);
  });

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (isTelegramCallbackAction(data)) {
      return;
    }
    await ctx.answerCallbackQuery({ text: "Unknown action" });
  });

  bot.on("message:photo", async (ctx) => {
    const handled = await handleTelegramPhotoMessage(ctx);
    if (handled) {
      return;
    }
  });

  bot.on(["message:video", "message:document", "message:animation"], async (ctx) => {
    await handleAwaitingUploadNonPhotoMessage(ctx);
  });

  bot.on("message:text", async (ctx) => {
    const handledFindFriends = await handleFindFriendsNameMessage(ctx);
    if (handledFindFriends) {
      return;
    }

    const handledUploadHint = await handleAwaitingUploadNonPhotoMessage(ctx);
    if (handledUploadHint) {
      return;
    }

    const text = ctx.message.text;
    if (!text.startsWith("/")) {
      return;
    }
    await clearTelegramChatStateForContext(ctx);
    await ctx.reply(UNKNOWN_COMMAND_MESSAGE);
  });

  registerTelegramBotErrorHandler(bot);
}

function replyWithMainKeyboard(ctx: Context, text: string) {
  return ctx.reply(text, { reply_markup: buildMainKeyboard() });
}

async function clearTelegramChatStateForContext(ctx: Context): Promise<void> {
  const chatId = getChatId(ctx);
  if (chatId) {
    await clearTelegramChatState(chatId);
  }
}

function getChatId(ctx: Context): string | null {
  const id = ctx.chat?.id;
  return id === undefined ? null : String(id);
}
