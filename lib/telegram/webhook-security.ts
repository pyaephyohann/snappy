import { timingSafeEqual } from "node:crypto";
import type { Update } from "grammy/types";

export const TELEGRAM_WEBHOOK_MAX_UPDATE_BYTES = 256 * 1024;
export const TELEGRAM_WEBHOOK_SECRET_HEADER = "x-telegram-bot-api-secret-token";

export function isTelegramUpdatePayload(value: unknown): value is Update {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const updateId = (value as { update_id?: unknown }).update_id;
  return typeof updateId === "number" && Number.isInteger(updateId);
}

export function verifyTelegramWebhookSecret(
  provided: string,
  expected: string | null,
): boolean {
  if (!expected) {
    return false;
  }
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export class TelegramWebhookPayloadTooLargeError extends Error {
  constructor() {
    super("Payload too large");
    this.name = "TelegramWebhookPayloadTooLargeError";
  }
}

export async function readTelegramWebhookBodyWithLimit(
  request: Request,
  maxBytes: number = TELEGRAM_WEBHOOK_MAX_UPDATE_BYTES,
): Promise<string> {
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      throw new Error("Invalid content length");
    }
    if (contentLength > maxBytes) {
      throw new TelegramWebhookPayloadTooLargeError();
    }
  }

  const reader = request.body?.getReader();
  if (!reader) {
    throw new Error("Missing body");
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new TelegramWebhookPayloadTooLargeError();
    }
    chunks.push(value);
  }

  return new TextDecoder().decode(concatUint8Arrays(chunks, total));
}

function concatUint8Arrays(chunks: Uint8Array[], total: number): Uint8Array {
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
