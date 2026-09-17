import { config } from "dotenv";
import { getTelegramBot } from "../lib/telegram/bot";
import { getTelegramBotToken } from "../lib/telegram/env";
import { sanitizeTelegramError } from "../lib/telegram/errors";

config({ path: ".env.local" });
config();

async function main() {
  if (!getTelegramBotToken()) {
    console.error("[TELEGRAM] TELEGRAM_BOT_TOKEN is not set");
    process.exit(1);
  }

  const bot = getTelegramBot();
  bot.catch((error) => {
    console.error("[TELEGRAM] Local polling error:", sanitizeTelegramError(error));
  });

  console.log(
    "[TELEGRAM] Starting local long polling. Press Ctrl+C to stop.",
  );
  console.log(
    "[TELEGRAM] Local polling is for development only. Production uses the webhook at /api/telegram/webhook.",
  );

  await bot.start({
    allowed_updates: ["message", "callback_query"],
    onStart: () => {
      console.log("[TELEGRAM] Bot is polling for updates");
    },
  });
}

main().catch((error: unknown) => {
  console.error("[TELEGRAM] Local bot failed:", sanitizeTelegramError(error));
  process.exit(1);
});
