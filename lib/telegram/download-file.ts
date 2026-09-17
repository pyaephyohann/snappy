import { requireTelegramBotToken } from "./env";
import { SNAP_MAX_IMAGE_BYTES } from "@/lib/snap-media";

const TELEGRAM_FILE_DOWNLOAD_TIMEOUT_MS = 30_000;

export type TelegramFileDownloadResult =
  | { ok: true; buffer: Buffer; mimeType: string | null }
  | { ok: false; reason: "too_large" | "download_failed" | "missing_path" };

/**
 * Downloads a Telegram file via the official Bot API (never user-supplied URLs).
 */
export async function downloadTelegramFile(
  filePath: string,
  declaredMimeType?: string | null,
): Promise<TelegramFileDownloadResult> {
  if (!filePath || filePath.includes("..")) {
    return { ok: false, reason: "missing_path" };
  }

  const token = requireTelegramBotToken();
  const url = `https://api.telegram.org/file/bot${token}/${filePath}`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TELEGRAM_FILE_DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, reason: "download_failed" };
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      const length = Number(contentLength);
      if (Number.isFinite(length) && length > SNAP_MAX_IMAGE_BYTES) {
        return { ok: false, reason: "too_large" };
      }
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > SNAP_MAX_IMAGE_BYTES) {
      return { ok: false, reason: "too_large" };
    }

    return {
      ok: true,
      buffer: Buffer.from(arrayBuffer),
      mimeType: declaredMimeType ?? response.headers.get("content-type"),
    };
  } catch {
    return { ok: false, reason: "download_failed" };
  }
}
