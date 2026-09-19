import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { listFriendsForUser } from "@/lib/relationships";

function parseLimit(raw: string | null): number {
  if (!raw) return 24;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
    return 24;
  }
  return parsed;
}

function isValidCursor(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

export async function GET(request: NextRequest) {
  const viewer = await getAuthenticatedAppUser();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cursor = request.nextUrl.searchParams.get("cursor");
  if (cursor && !isValidCursor(cursor)) {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  }

  const page = await listFriendsForUser({
    viewerId: viewer.id,
    cursor,
    limit: parseLimit(request.nextUrl.searchParams.get("limit")),
  });

  return NextResponse.json(page);
}
