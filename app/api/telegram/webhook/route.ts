import { NextResponse } from "next/server";
import { handleTelegramWebhook } from "@/lib/telegram/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function POST(request: Request) {
  return handleTelegramWebhook(request);
}

export function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
