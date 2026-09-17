import { NextResponse } from "next/server";

export function telegramMiniAppUnauthorizedResponse() {
  return NextResponse.json(
    { error: "Unauthorized", code: "session_expired" },
    { status: 401 },
  );
}
