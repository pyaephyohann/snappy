import { NextResponse } from "next/server";
import {
  buildTelegramBotStartUrl,
  getTelegramBotPublicUrl,
} from "@/lib/telegram/bot-public-link";
import { buildTelegramMiniAppUrl } from "@/lib/telegram/mini-app-url";

export async function GET() {
  return NextResponse.json({
    botUrl: getTelegramBotPublicUrl(),
    botFindUrl: buildTelegramBotStartUrl("find"),
    miniAppUrl: buildTelegramMiniAppUrl(),
  });
}
