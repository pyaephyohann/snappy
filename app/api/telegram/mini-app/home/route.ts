import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { loadRecentSnapsForHome } from "@/lib/recent-snaps";
import { telegramMiniAppUnauthorizedResponse } from "@/lib/telegram/mini-app-api";

export async function GET() {
  const session = await getSession();
  if (!session?.authenticated) {
    return telegramMiniAppUnauthorizedResponse();
  }

  const snaps = await loadRecentSnapsForHome();

  return NextResponse.json({
    snaps,
    userName: session.username,
  });
}
