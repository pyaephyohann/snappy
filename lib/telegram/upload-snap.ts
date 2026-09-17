import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { uploadSnapImageBuffer } from "@/lib/cloudinary-server-upload";
import { createSnapForUser } from "@/lib/snap-create-service";
import { validateSnapImageBuffer } from "@/lib/snap-media";
import { buildFriendProfileUrl } from "@/lib/notifications/internal-url";
import { buildAbsoluteSnappyUrl } from "@/lib/snap-telegram";
import { broadcastNewSnap } from "@/lib/notifications/notification-service";
import { getLinkedAccountByTelegramUserId } from "./account";
import {
  clearTelegramChatState,
  isAwaitingSnapUpload,
  setAwaitingSnapUpload,
} from "./chat-state";
import { createTelegramLinkChallenge } from "./link-service";
import { buildTelegramConnectUrl } from "./connect-url";
import { downloadTelegramFile } from "./download-file";
import { readTelegramPhotoCaption } from "./photo-caption";
import { sanitizeTelegramError } from "./errors";
import { getTelegramIdentity } from "./identity";
import { TELEGRAM_CALLBACK } from "./keyboards";
import {
  UPLOAD_AWAITING_PHOTO_MESSAGE,
  UPLOAD_CAPTION_TOO_LONG_MESSAGE,
  UPLOAD_LINK_REQUIRED_MESSAGE,
  UPLOAD_LOOKUP_ERROR_MESSAGE,
  UPLOAD_MEDIA_INVALID_MESSAGE,
  UPLOAD_MEDIA_TOO_LARGE_MESSAGE,
  UPLOAD_NOT_LINKED_MESSAGE,
  UPLOAD_PROMPT_MESSAGE,
  UPLOAD_RATE_LIMIT_MESSAGE,
  UPLOAD_SUCCESS_MESSAGE,
  UPLOAD_UNSUPPORTED_MEDIA_MESSAGE,
} from "./messages";
import { getSnappyPublicUrl } from "./public-url";
import {
  isTelegramUploadRateLimited,
  recordTelegramUpload,
} from "./upload-rate-limit";

export async function beginUploadSnapFlow(ctx: Context): Promise<void> {
  const identity = getTelegramIdentity(ctx);
  if (!identity) {
    await ctx.reply(UPLOAD_LOOKUP_ERROR_MESSAGE);
    return;
  }

  const linked = await getLinkedAccountByTelegramUserId(identity.telegramUserId);
  if (!linked) {
    try {
      const { token } = await createTelegramLinkChallenge({
        telegramUserId: identity.telegramUserId,
        telegramChatId: identity.chatId,
      });
      const connectUrl = buildTelegramConnectUrl(token);
      const keyboard = connectUrl
        ? new InlineKeyboard().url("🔗 Connect Snappy", connectUrl)
        : undefined;
      await ctx.reply(UPLOAD_NOT_LINKED_MESSAGE, { reply_markup: keyboard });
    } catch (error) {
      console.error(
        "[TELEGRAM] Link challenge creation failed:",
        sanitizeTelegramError(error),
      );
      await ctx.reply(UPLOAD_LOOKUP_ERROR_MESSAGE);
    }
    return;
  }

  if (identity.chatId) {
    await setAwaitingSnapUpload(identity.chatId);
  }
  await ctx.reply(UPLOAD_PROMPT_MESSAGE);
}

export async function handleTelegramPhotoMessage(ctx: Context): Promise<boolean> {
  const identity = getTelegramIdentity(ctx);
  if (!identity?.chatId) {
    return false;
  }

  const awaiting = await isAwaitingSnapUpload(identity.chatId);
  if (!awaiting) {
    return false;
  }

  await clearTelegramChatState(identity.chatId);

  const linked = await getLinkedAccountByTelegramUserId(identity.telegramUserId);
  if (!linked) {
    await ctx.reply(UPLOAD_LINK_REQUIRED_MESSAGE);
    return true;
  }

  if (await isTelegramUploadRateLimited(identity.telegramUserId)) {
    await ctx.reply(UPLOAD_RATE_LIMIT_MESSAGE);
    return true;
  }

  const photos = ctx.message?.photo;
  if (!photos?.length) {
    await ctx.reply(UPLOAD_UNSUPPORTED_MEDIA_MESSAGE);
    await setAwaitingSnapUpload(identity.chatId);
    return true;
  }

  const largest = photos[photos.length - 1];
  let filePath: string | undefined;
  try {
    const file = await ctx.api.getFile(largest.file_id);
    filePath = file.file_path;
  } catch (error) {
    console.error(
      "[TELEGRAM] getFile failed:",
      sanitizeTelegramError(error),
    );
    await ctx.reply(UPLOAD_LOOKUP_ERROR_MESSAGE);
    await setAwaitingSnapUpload(identity.chatId);
    return true;
  }

  if (!filePath) {
    await ctx.reply(UPLOAD_LOOKUP_ERROR_MESSAGE);
    await setAwaitingSnapUpload(identity.chatId);
    return true;
  }

  const downloaded = await downloadTelegramFile(filePath);
  if (!downloaded.ok) {
    if (downloaded.reason === "too_large") {
      await ctx.reply(UPLOAD_MEDIA_TOO_LARGE_MESSAGE);
    } else {
      await ctx.reply(UPLOAD_LOOKUP_ERROR_MESSAGE);
    }
    await setAwaitingSnapUpload(identity.chatId);
    return true;
  }

  const validated = validateSnapImageBuffer(
    downloaded.buffer,
    downloaded.mimeType,
  );
  if (!validated.ok) {
    if (validated.reason === "too_large") {
      await ctx.reply(UPLOAD_MEDIA_TOO_LARGE_MESSAGE);
    } else {
      await ctx.reply(UPLOAD_MEDIA_INVALID_MESSAGE);
    }
    await setAwaitingSnapUpload(identity.chatId);
    return true;
  }

  let cloudinaryResult;
  try {
    cloudinaryResult = await uploadSnapImageBuffer(
      downloaded.buffer,
      validated.mimeType,
    );
  } catch (error) {
    console.error(
      "[TELEGRAM] Cloudinary upload failed:",
      sanitizeTelegramError(error),
    );
    await ctx.reply(UPLOAD_LOOKUP_ERROR_MESSAGE);
    await setAwaitingSnapUpload(identity.chatId);
    return true;
  }

  const telegramCaption = readTelegramPhotoCaption(ctx.message?.caption);

  let created;
  try {
    created = await createSnapForUser({
      targetUserId: linked.userId,
      imageUrl: cloudinaryResult.secureUrl,
      publicId: cloudinaryResult.publicId,
      caption: telegramCaption,
    });
  } catch (error) {
    console.error(
      "[TELEGRAM] Snap create failed:",
      sanitizeTelegramError(error),
    );
    await ctx.reply(UPLOAD_LOOKUP_ERROR_MESSAGE);
    await setAwaitingSnapUpload(identity.chatId);
    return true;
  }

  if (!created.ok) {
    if (created.error === "invalid_caption") {
      await ctx.reply(UPLOAD_CAPTION_TOO_LONG_MESSAGE);
    } else {
      await ctx.reply(UPLOAD_LOOKUP_ERROR_MESSAGE);
    }
    await setAwaitingSnapUpload(identity.chatId);
    return true;
  }

  try {
    await recordTelegramUpload(identity.telegramUserId);
  } catch (error) {
    console.error(
      "[TELEGRAM] Upload log failed:",
      sanitizeTelegramError(error),
    );
  }

  void broadcastNewSnap({
    snapId: created.snap.id,
    profileOwnerName: created.ownerName,
  }).catch((notifyError) => {
    console.error(
      "[TELEGRAM] Snap notification error:",
      sanitizeTelegramError(notifyError),
    );
  });

  const viewUrl = buildAbsoluteSnappyUrl(
    getSnappyPublicUrl(),
    buildFriendProfileUrl(created.ownerName),
  );

  await ctx.reply(UPLOAD_SUCCESS_MESSAGE, {
    reply_markup: buildUploadSuccessKeyboard(viewUrl),
  });

  return true;
}

export async function handleAwaitingUploadNonPhotoMessage(
  ctx: Context,
): Promise<boolean> {
  const identity = getTelegramIdentity(ctx);
  if (!identity?.chatId) {
    return false;
  }
  const awaiting = await isAwaitingSnapUpload(identity.chatId);
  if (!awaiting) {
    return false;
  }
  await ctx.reply(UPLOAD_AWAITING_PHOTO_MESSAGE);
  return true;
}

function buildUploadSuccessKeyboard(viewUrl: string | null): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (viewUrl) {
    keyboard.url("🔗 View Snap", viewUrl).row();
  }
  keyboard.text("📤 Upload Another", TELEGRAM_CALLBACK.upload);
  return keyboard;
}
