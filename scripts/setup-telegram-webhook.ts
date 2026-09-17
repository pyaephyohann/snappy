import { config } from "dotenv";
import { Bot } from "grammy";
import { TELEGRAM_BOT_COMMANDS } from "../lib/telegram/commands";
import {
  getTelegramBotToken,
  getTelegramWebhookSecret,
} from "../lib/telegram/env";
import { sanitizeTelegramError } from "../lib/telegram/errors";
import { buildTelegramMiniAppUrl } from "../lib/telegram/mini-app-url";
import { getTelegramWebhookUrl } from "../lib/telegram/public-url";

config({ path: ".env.local" });
config();

async function main() {
  const token = getTelegramBotToken();
  const secret = getTelegramWebhookSecret();
  const webhookUrl = getTelegramWebhookUrl();

  if (!token) {
    console.error("[TELEGRAM] TELEGRAM_BOT_TOKEN is not set");
    process.exit(1);
  }
  if (!secret) {
    console.error("[TELEGRAM] TELEGRAM_WEBHOOK_SECRET is missing or invalid");
    process.exit(1);
  }
  if (!webhookUrl) {
    console.error(
      "[TELEGRAM] Set SNAPPY_PUBLIC_URL or TELEGRAM_WEBHOOK_URL to the https webhook endpoint",
    );
    process.exit(1);
  }

  const bot = new Bot(token);

  await bot.api.setWebhook(webhookUrl, {
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
    max_connections: 40,
  });

  await bot.api.setMyCommands([...TELEGRAM_BOT_COMMANDS]);

  const miniAppUrl = buildTelegramMiniAppUrl();
  if (miniAppUrl) {
    await bot.api.setChatMenuButton({
      menu_button: {
        type: "web_app",
        text: "📱 Open Snappy",
        web_app: { url: miniAppUrl },
      },
    });
    console.log("[TELEGRAM] Menu button Mini App:", miniAppUrl);
  } else {
    console.warn(
      "[TELEGRAM] SNAPPY_PUBLIC_URL not set; skipping Mini App menu button",
    );
  }

  const info = await bot.api.getWebhookInfo();
  console.log("[TELEGRAM] Webhook configured");
  console.log("[TELEGRAM] URL:", webhookUrl);
  console.log("[TELEGRAM] Pending updates:", info.pending_update_count);
  if (info.last_error_message) {
    console.log(
      "[TELEGRAM] Last webhook error:",
      sanitizeTelegramError(info.last_error_message),
    );
  }
}

main().catch((error: unknown) => {
  console.error(
    "[TELEGRAM] Failed to configure webhook:",
    sanitizeTelegramError(error),
  );
  process.exit(1);
});
