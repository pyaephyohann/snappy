import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getPaginatedSnapsForMiniApp,
  loadRecentSnapsForHome,
} from "@/lib/recent-snaps";
import { telegramMiniAppUnauthorizedResponse } from "@/lib/telegram/mini-app-api";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.authenticated) {
    return telegramMiniAppUnauthorizedResponse();
  }

  const cursor = request.nextUrl.searchParams.get("cursor");
  if (!cursor) {
    const firstPage = await getPaginatedSnapsForMiniApp();
    return NextResponse.json({
      ...firstPage,
      userName: session.username,
    });
  }

  const page = await getPaginatedSnapsForMiniApp({ cursor });
  return NextResponse.json({ ...page, userName: session.username });
}

// Keep the shared recent-feed loader referenced for web/Telegram parity and
// backwards compatibility with the existing route contract.
void loadRecentSnapsForHome;
