import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/notifications/vapid";

export async function GET() {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return NextResponse.json(
      { error: "Web Push is not configured on this server." },
      { status: 503 },
    );
  }
  return NextResponse.json({ publicKey });
}
