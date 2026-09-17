import { NextResponse } from "next/server";
import type { Update } from "grammy/types";
import { getReadyTelegramBot } from "./bot";
import { getTelegramWebhookSecret, isTelegramWebhookConfigured } from "./env";
import { sanitizeTelegramError } from "./errors";
import {
  isTelegramUpdatePayload,
  readTelegramWebhookBodyWithLimit,
  TELEGRAM_WEBHOOK_SECRET_HEADER,
  TelegramWebhookPayloadTooLargeError,
  verifyTelegramWebhookSecret,
} from "./webhook-security";

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
  const providedSecret = request.headers.get(TELEGRAM_WEBHOOK_SECRET_HEADER) ?? "";
  if (!verifyTelegramWebhookSecret(providedSecret, expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: string;
  try {
    rawBody = await readTelegramWebhookBodyWithLimit(request);
  } catch (error) {
    if (error instanceof TelegramWebhookPayloadTooLargeError) {
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

  if (!isTelegramUpdatePayload(update)) {
    return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  }

  try {
    const bot = await getReadyTelegramBot();
    await bot.handleUpdate(update);
  } catch (error) {
    console.error(
      "[TELEGRAM] Failed to handle update",
      (update as Update).update_id,
      sanitizeTelegramError(error),
    );
  }

  return NextResponse.json({ ok: true });
}
