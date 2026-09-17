import { Bot } from "grammy";
import { registerTelegramHandlers } from "./commands";
import { requireTelegramBotToken } from "./env";

let bot: Bot | null = null;
let initPromise: Promise<void> | null = null;

export function getTelegramBot(): Bot {
  if (bot) {
    return bot;
  }

  const instance = new Bot(requireTelegramBotToken());
  registerTelegramHandlers(instance);
  bot = instance;
  return instance;
}

export async function getReadyTelegramBot(): Promise<Bot> {
  const instance = getTelegramBot();
  if (instance.isInited()) {
    return instance;
  }

  initPromise ??= instance.init().catch((error: unknown) => {
    initPromise = null;
    throw error;
  });
  await initPromise;
  return instance;
}
