/**
 * Caption on the same Telegram message as the photo (message.caption).
 * Returns undefined when absent or whitespace-only.
 */
export function readTelegramPhotoCaption(
  caption: string | undefined | null,
): string | undefined {
  if (caption == null) {
    return undefined;
  }
  if (caption.trim().length === 0) {
    return undefined;
  }
  return caption;
}
