import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { lookupSnapByCode } from "@/lib/snap-lookup";
import { mapSnapLookupToMiniAppFindResponse } from "@/lib/telegram/mini-app-find";
import { sanitizeTelegramError } from "@/lib/telegram/errors";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const code = request.nextUrl.searchParams.get("code")?.trim() ?? "";

  try {
    const result = await lookupSnapByCode(code);
    return NextResponse.json(mapSnapLookupToMiniAppFindResponse(result));
  } catch (error) {
    console.error(
      "[TELEGRAM MINI APP] Find lookup failed:",
      sanitizeTelegramError(error),
    );
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 },
    );
  }
}
