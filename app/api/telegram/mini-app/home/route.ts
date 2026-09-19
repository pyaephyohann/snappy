import { NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { getHomeDataForUser } from "@/lib/home-data";
import { telegramMiniAppUnauthorizedResponse } from "@/lib/telegram/mini-app-api";

export async function GET() {
  const user = await getAuthenticatedAppUser();
  if (!user) {
    return telegramMiniAppUnauthorizedResponse();
  }

  return NextResponse.json({
    ...await getHomeDataForUser(user.id),
    userName: user.name,
  });
}
