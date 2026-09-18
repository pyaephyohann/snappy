import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { lookupSnapByCode } from "@/lib/snap-lookup";
import {
  buildAbsoluteSnappyUrl,
  formatSnapDateForTelegram,
} from "@/lib/snap-telegram";
import { isTelegramCommandText } from "@/lib/snap-code";
import {
  clearTelegramChatState,
  isAwaitingSnapCode,
  setAwaitingSnapCode,
} from "./chat-state";
import { sanitizeTelegramError } from "./errors";
import {
  appendMiniAppFindButton,
  buildMiniAppFindEntryKeyboard,
  TELEGRAM_CALLBACK,
} from "./keyboards";
import {
  FIND_INVALID_CODE_MESSAGE,
  FIND_LOOKUP_ERROR_MESSAGE,
  FIND_NOT_FOUND_MESSAGE,
  FIND_PROMPT_MESSAGE,
  formatFindFoundMessage,
} from "./messages";
import { getSnappyPublicUrl } from "./public-url";

export async function beginFindSnapFlow(ctx: Context): Promise<void> {
  const chatId = getChatId(ctx);
  if (chatId) {
    await setAwaitingSnapCode(chatId);
  }
  const miniAppKeyboard = buildMiniAppFindEntryKeyboard();
  await ctx.reply(FIND_PROMPT_MESSAGE, {
    reply_markup: miniAppKeyboard ?? undefined,
  });
}

export async function handleFindSnapCodeMessage(ctx: Context): Promise<boolean> {
  const chatId = getChatId(ctx);
  const text = ctx.message?.text;
  if (!chatId || !text || isTelegramCommandText(text)) {
    return false;
  }

  const awaiting = await isAwaitingSnapCode(chatId);
  if (!awaiting) {
    return false;
  }

  await clearTelegramChatState(chatId);

  let result;
  try {
    result = await lookupSnapByCode(text);
  } catch (error) {
    console.error("[TELEGRAM] Snap lookup failed:", sanitizeTelegramError(error));
    await ctx.reply(FIND_LOOKUP_ERROR_MESSAGE);
    return true;
  }

  if (result.status === "invalid_input") {
    await ctx.reply(FIND_INVALID_CODE_MESSAGE);
    await setAwaitingSnapCode(chatId);
    return true;
  }

  if (result.status === "not_found") {
    await ctx.reply(FIND_NOT_FOUND_MESSAGE, {
      reply_markup: buildFindRetryKeyboard(),
    });
    return true;
  }

  const origin = getSnappyPublicUrl();
  const viewUrl = buildAbsoluteSnappyUrl(origin, result.snap.viewPath);
  const message = formatFindFoundMessage({
    creatorName: result.snap.creatorName,
    createdLabel: formatSnapDateForTelegram(result.snap.createdAt),
    caption: result.snap.caption,
    viewUrl,
  });

  try {
    await ctx.replyWithPhoto(result.snap.imageUrl, {
      caption: message,
      reply_markup: buildFindResultKeyboard(viewUrl, result.snap.code),
    });
  } catch (error) {
    console.error(
      "[TELEGRAM] Snap photo reply failed:",
      sanitizeTelegramError(error),
    );
    await ctx.reply(message, {
      reply_markup: buildFindResultKeyboard(viewUrl, result.snap.code),
    });
  }

  return true;
}

function buildFindRetryKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard().text("🔎 Try again", TELEGRAM_CALLBACK.find);
  return appendMiniAppFindButton(keyboard);
}

function buildFindResultKeyboard(
  viewUrl: string | null,
  snapCode: string,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (viewUrl) {
    keyboard.url("🔗 View Snap", viewUrl).row();
  }
  appendMiniAppFindButton(keyboard, snapCode);
  keyboard.row().text("🔎 Find Another", TELEGRAM_CALLBACK.find);
  return keyboard;
}

function getChatId(ctx: Context): string | null {
  const id = ctx.chat?.id;
  return id === undefined ? null : String(id);
}
