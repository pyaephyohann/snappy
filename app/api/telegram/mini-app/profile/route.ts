import { NextResponse } from "next/server";
import { loadMiniAppProfileForSession } from "@/lib/telegram/mini-app-profile";

export async function GET() {
  const profile = await loadMiniAppProfileForSession();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(profile);
}
