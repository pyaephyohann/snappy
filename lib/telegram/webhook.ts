import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { Update } from "grammy/types";
import { getReadyTelegramBot } from "./bot";
import { getTelegramWebhookSecret, isTelegramWebhookConfigured } from "./env";
import { sanitizeTelegramError } from "./errors";

const MAX_UPDATE_BYTES = 256 * 1024;
const SECRET_HEADER = "x-telegram-bot-api-secret-token";

export async function handleTelegramWebhook(
  request: Request,
): Promise<NextResponse> {
  if (!isTelegramWebhookConfigured()) {
    console.error("[TELEGRAM] Webhook received but Telegram is not configured");
    return NextResponse.json(
      { error: "Service unavailable" },
      { status: 503 },
    );
  }

  const expectedSecret = getTelegramWebhookSecret();
  const providedSecret = request.headers.get(SECRET_HEADER) ?? "";
  if (!expectedSecret || !secretsEqual(providedSecret, expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: string;
  try {
    rawBody = await readBodyWithLimit(request, MAX_UPDATE_BYTES);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  let update: unknown;
  try {
    update = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isTelegramUpdate(update)) {
    return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  }

  try {
    const bot = await getReadyTelegramBot();
    await bot.handleUpdate(update);
  } catch (error) {
    console.error(
      "[TELEGRAM] Failed to handle update",
      update.update_id,
      sanitizeTelegramError(error),
    );
  }

  return NextResponse.json({ ok: true });
}

function isTelegramUpdate(value: unknown): value is Update {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const updateId = (value as { update_id?: unknown }).update_id;
  return typeof updateId === "number" && Number.isInteger(updateId);
}

function secretsEqual(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

class PayloadTooLargeError extends Error {
  constructor() {
    super("Payload too large");
    this.name = "PayloadTooLargeError";
  }
}

async function readBodyWithLimit(
  request: Request,
  maxBytes: number,
): Promise<string> {
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      throw new Error("Invalid content length");
    }
    if (contentLength > maxBytes) {
      throw new PayloadTooLargeError();
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
      throw new PayloadTooLargeError();
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
