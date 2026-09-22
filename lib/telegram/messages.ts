import { SNAP_MAX_CAPTION_LENGTH } from "@/lib/snap-media";
import type { SparkUsageSummary } from "@/lib/spark-usage";

export const START_MESSAGE = [
  "📸 Welcome to Snappy!",
  "",
  "Share and discover moments with your friends.",
  "",
  "Commands:",
  "/find_friends — View your friends' Snaps",
  "/upload — Upload a Snap",
  "/help — Show available commands",
].join("\n");

export const HELP_MESSAGE = [
  "Snappy Telegram commands:",
  "",
  "/start — Introduction and shortcuts",
  "/find_friends — View your friends' Snaps",
  "/upload — Upload a photo Snap",
  "/help — Show this message",
  "",
  "Use the buttons below — 📱 Open Snappy launches the Mini App — or open Snappy on the web.",
].join("\n");

export const FIND_FRIENDS_NOT_LINKED_MESSAGE = [
  "👥 Find friends' Snaps",
  "",
  "Connect your Snappy account first. Send /upload to get a connect link.",
].join("\n");

export const FIND_FRIENDS_NO_FRIENDS_MESSAGE =
  "You don't have any friends yet.";

export const FIND_FRIENDS_LOOKUP_ERROR_MESSAGE =
  "Something went wrong. Please try again in a moment.";

export function formatFindFriendsIntro(friendNames: string[]): string {
  const lines = [
    "👥 Your friends",
    "",
    "Type a friend's name to see their Snaps.",
    "",
  ];
  const maxListed = 40;
  const listed = friendNames.slice(0, maxListed);
  for (const name of listed) {
    lines.push(`• ${name}`);
  }
  if (friendNames.length > maxListed) {
    lines.push(`• …and ${friendNames.length - maxListed} more`);
  }
  return lines.join("\n");
}

export function formatFindFriendsMultipleMatches(
  friends: { name: string }[],
): string {
  const lines = ["I found multiple friends:", ""];
  friends.forEach((friend, index) => {
    lines.push(`${index + 1}. ${friend.name}`);
  });
  lines.push("", "Type the friend's full name.");
  return lines.join("\n");
}

export const FIND_FRIENDS_NOT_FOUND_MESSAGE = [
  "I couldn't find that friend.",
  "",
  "Try typing their name again.",
].join("\n");

export function formatFindFriendsPageIntro(friendName: string): string {
  return `I found ${friendName}.`;
}

export function formatFindFriendsShowingRange(
  start: number,
  end: number,
): string {
  return `Showing ${start}–${end}.`;
}

export function formatFindFriendsMoreHint(): string {
  return "Type the friend's name again for more.";
}

export function formatFindFriendsAllDone(friendName: string): string {
  return `That's all the Snaps from ${friendName}. 📸`;
}

export function formatFindFriendsNoSnaps(friendName: string): string {
  return `${friendName} hasn't posted any Snaps yet.`;
}

export function formatFindFoundMessage(options: {
  creatorName: string;
  createdLabel: string;
  caption: string | null;
  viewUrl: string | null;
}): string {
  const lines = [
    "📸 Snap found!",
    "",
    `👤 Creator: ${options.creatorName}`,
    `📅 ${options.createdLabel}`,
  ];
  if (options.caption?.trim()) {
    lines.push("", options.caption.trim());
  }
  if (!options.viewUrl) {
    lines.push(
      "",
      "Open Snappy on the web to view this Snap (public URL is not configured).",
    );
  }
  return lines.join("\n");
}

export const UPLOAD_NOT_LINKED_MESSAGE = [
  "📤 Upload a Snap",
  "",
  "Before you can upload from Telegram, connect your Snappy account.",
].join("\n");

export const UPLOAD_LINK_REQUIRED_MESSAGE =
  "Your Telegram account is not connected to Snappy. Send /upload to connect.";

export const UPLOAD_CHOOSE_TARGET_MESSAGE =
  "Choose who this Snap is for";

export const UPLOAD_NO_FRIENDS_MESSAGE =
  "You don't have any friends available to receive a Snap yet.";

export const UPLOAD_TARGET_NOT_FOUND_MESSAGE = [
  "I couldn't find that friend.",
  "",
  "Please choose a friend from the list or try their name again.",
].join("\n");

export const UPLOAD_TARGET_STALE_MESSAGE = [
  "That friend is no longer available for this Snap.",
  "",
  "Please send /upload to choose a friend again.",
].join("\n");

export function formatUploadTargetSelected(friendName: string): string {
  return [
    `✓ Snap recipient: ${friendName}`,
    "",
    "Send me the photo you want to upload.",
  ].join("\n");
}

export const UPLOAD_PROMPT_MESSAGE = [
  "📤 Upload a Snap",
  "",
  "Send me a photo.",
].join("\n");

export const UPLOAD_SUCCESS_MESSAGE = [
  "✅ Snap uploaded!",
  "",
  "Your Snap is now on Snappy.",
].join("\n");

/** Spark outcome for one logical upload, exactly as reported by the server. */
export interface UploadSparkOutcome {
  isFreeUpload: boolean;
  sparkRewardCredited: boolean;
  sparkSpent: number;
  sparkRewarded: number;
}

/**
 * Bot success reply driven by the actual server result (S2).
 * Free uploads that earned a Spark show the reward; Spark-paid uploads show
 * the real charge. An idempotent replay reports the recorded outcome for that
 * logical upload, so it stays accurate without implying a second charge.
 */
export function formatUploadSuccessResult(
  outcome: UploadSparkOutcome,
): string {
  const lines = ["✅ Snap uploaded!", "", "Your Snap is now on Snappy."];

  if (!outcome.isFreeUpload && outcome.sparkSpent > 0) {
    lines.push(`-${outcome.sparkSpent} Sparks ✨`);
  } else if (outcome.sparkRewardCredited && outcome.sparkRewarded > 0) {
    lines.push(`+${outcome.sparkRewarded} Spark ✨`);
  }

  return lines.join("\n");
}

export const UPLOAD_INSUFFICIENT_SPARKS_MESSAGE = [
  "✨ You're out of Sparks",
  "",
  "You've used all your free uploads for today and don't have enough Sparks for an extra upload.",
  "",
  "Free uploads reset at 00:00 (Asia/Yangon).",
].join("\n");

/** Insufficient-Sparks reply with the server's current numbers when available. */
export function formatUploadInsufficientSparksMessage(
  usage: Pick<
    SparkUsageSummary,
    "freeDailyUploads" | "extraUploadCost" | "balance"
  > | null,
): string {
  if (!usage) return UPLOAD_INSUFFICIENT_SPARKS_MESSAGE;

  return [
    "✨ You're out of Sparks",
    "",
    `You've used all ${usage.freeDailyUploads} free uploads today.`,
    `An extra upload costs ${usage.extraUploadCost} Sparks — you have ${usage.balance}.`,
    "",
    "Free uploads reset at 00:00 (Asia/Yangon).",
  ].join("\n");
}

export const UPLOAD_UNSUPPORTED_MEDIA_MESSAGE =
  "Please send a photo. Snappy currently supports images up to 10 MB through Telegram.";

export const UPLOAD_MEDIA_TOO_LARGE_MESSAGE =
  "That image is too large. Please send a photo under 10 MB.";

export const UPLOAD_MEDIA_INVALID_MESSAGE =
  "That file doesn't look like a supported image. Please send a JPEG, PNG, WebP, or GIF.";

export const UPLOAD_CAPTION_TOO_LONG_MESSAGE = [
  "That caption is too long for Snappy.",
  "",
  `Please use ${SNAP_MAX_CAPTION_LENGTH} characters or fewer and send the photo again.`,
].join("\n");

export const UPLOAD_RATE_LIMIT_MESSAGE =
  "You've uploaded several Snaps recently. Please wait a bit before uploading again.";

export const UPLOAD_LOOKUP_ERROR_MESSAGE =
  "Something went wrong during upload. Please try again in a moment.";

export const UPLOAD_AWAITING_PHOTO_MESSAGE =
  "I'm waiting for a photo. Send an image, or /upload to start over.";

export const UNKNOWN_COMMAND_MESSAGE =
  "Unknown command. Send /help to see what I can do.";
