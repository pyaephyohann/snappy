/**
 * Safe production Telegram verification (T7).
 * Loads .env.local — never prints secrets.
 *
 * Run: npm run telegram:verify-production
 */
import { config } from "dotenv";
import { Bot } from "grammy";
import {
  getTelegramBotToken,
  getTelegramWebhookSecret,
} from "../lib/telegram/env";
import { getTelegramBotPublicUrl } from "../lib/telegram/bot-public-link";
import { buildTelegramMiniAppUrl } from "../lib/telegram/mini-app-url";
import { sanitizeTelegramError } from "../lib/telegram/errors";
import { getSnappyPublicUrl, getTelegramWebhookUrl } from "../lib/telegram/public-url";

config({ path: ".env.local" });
config();

type Status = "configured" | "missing" | "invalid-looking" | "not-verifiable";

function envStatus(name: string, value: string | null, validate?: (v: string) => boolean): Status {
  if (!value) {
    return "missing";
  }
  if (validate && !validate(value)) {
    return "invalid-looking";
  }
  return "configured";
}

async function probeHttps(url: string): Promise<{ reachable: boolean; status?: number }> {
  try {
    const response = await fetch(url, { method: "GET", redirect: "follow" });
    return { reachable: true, status: response.status };
  } catch {
    return { reachable: false };
  }
}

async function main() {
  const token = getTelegramBotToken();
  const webhookSecret = getTelegramWebhookSecret();
  const publicUrl = getSnappyPublicUrl();
  const webhookUrl = getTelegramWebhookUrl();
  const botUsername = process.env.TELEGRAM_BOT_USERNAME?.trim() ?? null;
  const initDataMaxAge = process.env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS?.trim() ?? null;

  console.log("[T7] Production configuration audit (values hidden)\n");

  const rows: Array<{ name: string; status: Status }> = [
    {
      name: "TELEGRAM_BOT_TOKEN",
      status: envStatus("TELEGRAM_BOT_TOKEN", token),
    },
    {
      name: "TELEGRAM_WEBHOOK_SECRET",
      status: envStatus("TELEGRAM_WEBHOOK_SECRET", webhookSecret),
    },
    {
      name: "SNAPPY_PUBLIC_URL",
      status: envStatus(
        "SNAPPY_PUBLIC_URL",
        publicUrl,
        (v) => v.startsWith("https://"),
      ),
    },
    {
      name: "TELEGRAM_WEBHOOK_URL",
      status: webhookUrl
        ? envStatus("TELEGRAM_WEBHOOK_URL", webhookUrl, (v) => v.startsWith("https://"))
        : publicUrl
          ? "configured"
          : "missing",
    },
    {
      name: "TELEGRAM_BOT_USERNAME",
      status: envStatus(
        "TELEGRAM_BOT_USERNAME",
        botUsername,
        () => Boolean(getTelegramBotPublicUrl()),
      ),
    },
    {
      name: "TELEGRAM_INIT_DATA_MAX_AGE_SECONDS",
      status: initDataMaxAge ? "configured" : "not-verifiable",
    },
  ];

  for (const row of rows) {
    console.log(`  ${row.name}: ${row.status}`);
  }

  const miniAppUrl = buildTelegramMiniAppUrl();
  console.log("\n[T7] Derived URLs (non-secret)");
  console.log(`  Mini App: ${miniAppUrl ?? "(not configured)"}`);
  console.log(`  Webhook target: ${webhookUrl ?? "(not configured)"}`);

  if (!token || !webhookSecret) {
    console.error("\n[T7] Cannot query Telegram webhook: bot token or webhook secret missing.");
    process.exit(1);
  }

  const bot = new Bot(token);
  let info;
  try {
    info = await bot.api.getWebhookInfo();
  } catch (error) {
    console.error(
      "\n[T7] getWebhookInfo failed:",
      sanitizeTelegramError(error),
    );
    process.exit(1);
  }

  console.log("\n[T7] Telegram getWebhookInfo");
  console.log(`  url: ${info.url || "(empty — webhook not set)"}`);
  console.log(`  has_custom_certificate: ${info.has_custom_certificate}`);
  console.log(`  pending_update_count: ${info.pending_update_count}`);
  if (info.last_error_message) {
    console.log(
      `  last_error_message: ${sanitizeTelegramError(info.last_error_message)}`,
    );
  }
  if (info.last_error_date) {
    console.log(
      `  last_error_date: ${new Date(info.last_error_date * 1000).toISOString()}`,
    );
  }

  const expectedWebhook = webhookUrl ?? "";
  if (expectedWebhook && info.url && info.url !== expectedWebhook) {
    console.warn(
      "\n[T7] WARNING: Telegram webhook URL does not match configured TELEGRAM_WEBHOOK_URL / SNAPPY_PUBLIC_URL derivation.",
    );
  } else if (expectedWebhook && info.url === expectedWebhook) {
    console.log("\n[T7] Webhook URL matches configured production endpoint.");
  }

  if (expectedWebhook) {
    const getProbe = await probeHttps(expectedWebhook);
    console.log("\n[T7] HTTP probe (GET webhook — expect 405 Method Not Allowed)");
    console.log(
      `  reachable: ${getProbe.reachable}${getProbe.status !== undefined ? `, status: ${getProbe.status}` : ""}`,
    );

    const postProbe = await fetch(expectedWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => null);
    if (postProbe) {
      console.log(
        `[T7] POST without secret: status ${postProbe.status} (expect 401 when webhook enabled)`,
      );
    }
  }

  if (miniAppUrl) {
    const miniProbe = await probeHttps(miniAppUrl);
    console.log("\n[T7] Mini App route probe");
    console.log(
      `  reachable: ${miniProbe.reachable}${miniProbe.status !== undefined ? `, status: ${miniProbe.status}` : ""}`,
    );
  }

  console.log(
    "\n[T7] Live Telegram client flows (bot commands, Mini App UI, upload, linking) must be verified manually in Telegram.",
  );
}

main().catch((error: unknown) => {
  console.error("[T7] Verification failed:", sanitizeTelegramError(error));
  process.exit(1);
});
