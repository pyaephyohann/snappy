import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { uploadSnapImageBuffer } from "@/lib/cloudinary-server-upload";
import { createSnapWithSparkAccounting } from "@/lib/snap-upload-service";
import {
  getSparkUsageSummary,
  SPARK_PER_UPLOAD_REWARD,
} from "@/lib/spark-service";
import { validateSnapImageBuffer } from "@/lib/snap-media";
import { matchFriendsByNamePartial } from "@/lib/friends-search";
import { listSnappyFriendsForUser } from "@/lib/snappy-friends";
import { buildFriendProfileUrl } from "@/lib/notifications/internal-url";
import { buildAbsoluteSnappyUrl } from "@/lib/snap-telegram";
import { broadcastNewSnap } from "@/lib/notifications/notification-service";
import { getLinkedAccountByTelegramUserId } from "./account";
import {
  clearTelegramChatState,
  getAwaitingSnapUploadTarget,
  getTelegramUserStateKey,
  isAwaitingSnapUpload,
  isAwaitingUploadTarget,
  setAwaitingSnapUploadForTarget,
  setAwaitingUploadTarget,
} from "./chat-state";
import { createTelegramLinkChallenge } from "./link-service";
import { buildTelegramConnectUrl } from "./connect-url";
import { downloadTelegramFile } from "./download-file";
import { readTelegramPhotoCaption } from "./photo-caption";
import { sanitizeTelegramError } from "./errors";
import { getTelegramIdentity } from "./identity";
import {
  buildUploadTargetKeyboard,
  TELEGRAM_CALLBACK,
} from "./keyboards";
import {
  UPLOAD_AWAITING_PHOTO_MESSAGE,
  UPLOAD_CHOOSE_TARGET_MESSAGE,
  UPLOAD_CAPTION_TOO_LONG_MESSAGE,
  UPLOAD_LINK_REQUIRED_MESSAGE,
  UPLOAD_LOOKUP_ERROR_MESSAGE,
  UPLOAD_MEDIA_INVALID_MESSAGE,
  UPLOAD_MEDIA_TOO_LARGE_MESSAGE,
  UPLOAD_NOT_LINKED_MESSAGE,
  UPLOAD_NO_FRIENDS_MESSAGE,
  UPLOAD_TARGET_NOT_FOUND_MESSAGE,
  UPLOAD_TARGET_STALE_MESSAGE,
  formatUploadTargetSelected,
  UPLOAD_RATE_LIMIT_MESSAGE,
  formatUploadSuccessResult,
  formatUploadInsufficientSparksMessage,
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

  if (!identity.chatId) {
    await ctx.reply(UPLOAD_LOOKUP_ERROR_MESSAGE);
    return;
  }

  let friends;
  try {
    friends = await listSnappyFriendsForUser(linked.userId);
  } catch (error) {
    console.error(
      "[TELEGRAM] Upload recipient list failed:",
      sanitizeTelegramError(error),
    );
    await ctx.reply(UPLOAD_LOOKUP_ERROR_MESSAGE);
    return;
  }

  if (friends.length === 0) {
    await ctx.reply(UPLOAD_NO_FRIENDS_MESSAGE);
    return;
  }

  const stateKey = getTelegramUserStateKey(
    identity.chatId,
    identity.telegramUserId,
  );
  await setAwaitingUploadTarget(stateKey);
  await ctx.reply(UPLOAD_CHOOSE_TARGET_MESSAGE, {
    reply_markup: buildUploadTargetKeyboard(friends),
  });
}

async function listUploadRecipients(telegramUserId: string) {
  const linked = await getLinkedAccountByTelegramUserId(telegramUserId);
  if (!linked) return null;
  return {
    linked,
    friends: await listSnappyFriendsForUser(linked.userId),
  };
}

export async function handleUploadTargetSelection(
  ctx: Context,
  targetUserId: string,
): Promise<boolean> {
  const identity = getTelegramIdentity(ctx);
  if (!identity?.chatId) return false;
  const stateKey = getTelegramUserStateKey(
    identity.chatId,
    identity.telegramUserId,
  );

  if (!(await isAwaitingUploadTarget(stateKey))) return false;

  try {
    const recipientData = await listUploadRecipients(identity.telegramUserId);
    const friend = recipientData?.friends.find(
      (candidate) => candidate.id === targetUserId,
    );
    if (!recipientData || !friend) {
      await ctx.reply(UPLOAD_TARGET_STALE_MESSAGE);
      await clearTelegramChatState(stateKey);
      return true;
    }

    await setAwaitingSnapUploadForTarget(stateKey, friend.id);
    await ctx.reply(formatUploadTargetSelected(friend.name));
    return true;
  } catch (error) {
    console.error(
      "[TELEGRAM] Upload recipient selection failed:",
      sanitizeTelegramError(error),
    );
    await ctx.reply(UPLOAD_LOOKUP_ERROR_MESSAGE);
    return true;
  }
}

export async function handleUploadTargetNameMessage(
  ctx: Context,
): Promise<boolean> {
  const identity = getTelegramIdentity(ctx);
  const text = ctx.message?.text;
  if (!identity?.chatId || !text || text.startsWith("/")) return false;
  const stateKey = getTelegramUserStateKey(
    identity.chatId,
    identity.telegramUserId,
  );
  if (!(await isAwaitingUploadTarget(stateKey))) return false;

  try {
    const recipientData = await listUploadRecipients(identity.telegramUserId);
    if (!recipientData) {
      await ctx.reply(UPLOAD_LINK_REQUIRED_MESSAGE);
      return true;
    }

    const matches = matchFriendsByNamePartial(recipientData.friends, text);
    if (matches.length === 0) {
      await ctx.reply(UPLOAD_TARGET_NOT_FOUND_MESSAGE, {
        reply_markup: buildUploadTargetKeyboard(recipientData.friends),
      });
      return true;
    }
    if (matches.length > 1) {
      await ctx.reply(formatUploadTargetMultipleMatches(matches), {
        reply_markup: buildUploadTargetKeyboard(matches),
      });
      return true;
    }

    return handleUploadTargetSelection(ctx, matches[0].id);
  } catch (error) {
    console.error(
      "[TELEGRAM] Upload recipient name lookup failed:",
      sanitizeTelegramError(error),
    );
    await ctx.reply(UPLOAD_LOOKUP_ERROR_MESSAGE);
    return true;
  }
}

function formatUploadTargetMultipleMatches(
  friends: { name: string }[],
): string {
  return [
    "I found multiple friends:",
    "",
    ...friends.map((friend, index) => `${index + 1}. ${friend.name}`),
    "",
    "Choose one below or type the friend's full name.",
  ].join("\n");
}

export async function handleTelegramPhotoMessage(ctx: Context): Promise<boolean> {
  const identity = getTelegramIdentity(ctx);
  if (!identity?.chatId) {
    return false;
  }

  const stateKey = getTelegramUserStateKey(
    identity.chatId,
    identity.telegramUserId,
  );
  const targetUserId = await getAwaitingSnapUploadTarget(stateKey);
  if (!targetUserId || !(await isAwaitingSnapUpload(stateKey))) {
    return false;
  }

  const linked = await getLinkedAccountByTelegramUserId(identity.telegramUserId);
  if (!linked) {
    await clearTelegramChatState(stateKey);
    await ctx.reply(UPLOAD_LINK_REQUIRED_MESSAGE);
    return true;
  }

  let allowedRecipients;
  try {
    allowedRecipients = await listSnappyFriendsForUser(linked.userId);
  } catch (error) {
    console.error(
      "[TELEGRAM] Upload recipient validation failed:",
      sanitizeTelegramError(error),
    );
    await ctx.reply(UPLOAD_LOOKUP_ERROR_MESSAGE);
    await setAwaitingSnapUploadForTarget(stateKey, targetUserId);
    return true;
  }

  if (!allowedRecipients.some((friend) => friend.id === targetUserId)) {
    await clearTelegramChatState(stateKey);
    await ctx.reply(UPLOAD_TARGET_STALE_MESSAGE);
    return true;
  }

  await clearTelegramChatState(stateKey);

  if (await isTelegramUploadRateLimited(identity.telegramUserId)) {
    await ctx.reply(UPLOAD_RATE_LIMIT_MESSAGE);
    return true;
  }

  const photos = ctx.message?.photo;
  if (!photos?.length) {
    await ctx.reply(UPLOAD_UNSUPPORTED_MEDIA_MESSAGE);
    await setAwaitingSnapUploadForTarget(stateKey, targetUserId);
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
    await setAwaitingSnapUploadForTarget(stateKey, targetUserId);
    return true;
  }

  if (!filePath) {
    await ctx.reply(UPLOAD_LOOKUP_ERROR_MESSAGE);
    await setAwaitingSnapUploadForTarget(stateKey, targetUserId);
    return true;
  }

  const downloaded = await downloadTelegramFile(filePath);
  if (!downloaded.ok) {
    if (downloaded.reason === "too_large") {
      await ctx.reply(UPLOAD_MEDIA_TOO_LARGE_MESSAGE);
    } else {
      await ctx.reply(UPLOAD_LOOKUP_ERROR_MESSAGE);
    }
    await setAwaitingSnapUploadForTarget(stateKey, targetUserId);
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
    await setAwaitingSnapUploadForTarget(stateKey, targetUserId);
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
    await setAwaitingSnapUploadForTarget(stateKey, targetUserId);
    return true;
  }

  const telegramCaption = readTelegramPhotoCaption(ctx.message?.caption);

  let created;
  try {
    // Telegram update_id is stable across webhook processing retries and
    // uniquely identifies this incoming photo message/update.
    const uploadIdempotencyKey =
      `tg-${identity.telegramUserId}-update-${ctx.update.update_id}`;

    created = await createSnapWithSparkAccounting({
      targetUserId,
      uploadedById: linked.userId,
      imageUrl: cloudinaryResult.secureUrl,
      publicId: cloudinaryResult.publicId,
      caption: telegramCaption,
      idempotencyKey: uploadIdempotencyKey,
    });
  } catch (error) {
    console.error(
      "[TELEGRAM] Snap create failed:",
      sanitizeTelegramError(error),
    );
    // Distinguish Spark-related errors from generic failures.
    if (error && typeof error === "object" && "code" in error) {
      const err = error as { code: string; message?: string };
      if (err.code === "insufficient_sparks") {
        // Use the authoritative numbers so the user understands the state
        // instead of a bare failure.
        const usage = await getSparkUsageSummary(linked.userId).catch(
          () => null,
        );
        await ctx.reply(formatUploadInsufficientSparksMessage(usage));
        await setAwaitingSnapUploadForTarget(stateKey, targetUserId);
        return true;
      }
      if (err.message === "invalid_caption") {
        await ctx.reply(UPLOAD_CAPTION_TOO_LONG_MESSAGE);
        await setAwaitingSnapUploadForTarget(stateKey, targetUserId);
        return true;
      }
    }
    await ctx.reply(UPLOAD_LOOKUP_ERROR_MESSAGE);
    await setAwaitingSnapUploadForTarget(stateKey, targetUserId);
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

  // Await the broadcast: the webhook response is returned right after this
  // handler, and an un-awaited promise would be terminated on serverless
  // before the push is delivered. Errors are caught so upload never fails.
  try {
    await broadcastNewSnap({
      snapId: created.snap.id,
      profileOwnerName: created.ownerName,
      uploaderName: created.uploaderName,
    });
  } catch (notifyError) {
    console.error(
      "[TELEGRAM] Snap notification error:",
      sanitizeTelegramError(notifyError),
    );
  }

  const viewUrl = buildAbsoluteSnappyUrl(
    getSnappyPublicUrl(),
    buildFriendProfileUrl(created.ownerName),
  );

  await ctx.reply(
    formatUploadSuccessResult({
      isFreeUpload: created.isFreeUpload,
      sparkRewardCredited: created.sparkRewardCredited,
      sparkSpent: created.sparkSpent,
      sparkRewarded: created.sparkRewardCredited
        ? SPARK_PER_UPLOAD_REWARD
        : 0,
    }),
    {
      reply_markup: buildUploadSuccessKeyboard(viewUrl),
    },
  );

  return true;
}

export async function handleAwaitingUploadNonPhotoMessage(
  ctx: Context,
): Promise<boolean> {
  const identity = getTelegramIdentity(ctx);
  if (!identity?.chatId) {
    return false;
  }
  const stateKey = getTelegramUserStateKey(
    identity.chatId,
    identity.telegramUserId,
  );
  const awaiting = await isAwaitingSnapUpload(stateKey);
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
