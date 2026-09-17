import { NextResponse } from "next/server";
import { loadMiniAppProfileForSession } from "@/lib/telegram/mini-app-profile";
import { telegramMiniAppUnauthorizedResponse } from "@/lib/telegram/mini-app-api";

export async function GET() {
  const profile = await loadMiniAppProfileForSession();
  if (!profile) {
    return telegramMiniAppUnauthorizedResponse();
  }
  return NextResponse.json(profile);
}
