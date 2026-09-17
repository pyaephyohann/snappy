import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { establishMiniAppSessionFromInitData } from "@/lib/telegram/mini-app-auth";
import { buildTelegramMiniAppUrl } from "@/lib/telegram/mini-app-url";
import { TELEGRAM_MINI_APP_INIT_DATA_MAX_BYTES } from "@/lib/telegram/mini-app-request-limits";
import { getSnappyPublicUrl } from "@/lib/telegram/public-url";

const bodySchema = z.object({
  initData: z.string().min(1).max(TELEGRAM_MINI_APP_INIT_DATA_MAX_BYTES),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const result = await establishMiniAppSessionFromInitData(parsed.data.initData);

  if (result.status === "invalid") {
    return NextResponse.json({ error: result.reason }, { status: 401 });
  }

  if (result.status === "linked") {
    return NextResponse.json({
      linked: true,
      snappyUserName: result.snappyUserName,
      telegramUsername: result.telegramUsername,
      snappyUrl: getSnappyPublicUrl(),
    });
  }

  return NextResponse.json({
    linked: false,
    connectUrl: result.connectUrl,
    telegramUsername: result.telegramUsername,
    miniAppUrl: buildTelegramMiniAppUrl(),
  });
}
