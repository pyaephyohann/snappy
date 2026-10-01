import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/lib/auth";
import {
  decodeUserListCursor,
  listFriendsForUser,
} from "@/lib/relationships";

function parseLimit(raw: string | null): number {
  if (!raw) return 24;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
    return 24;
  }
  return parsed;
}

export async function GET(request: NextRequest) {
  const viewer = await getAuthenticatedAppUser();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Validate with the shared decoder (same contract as `/api/users/list`):
  // F1 cursors are opaque base64url JSON and legitimately exceed 64 chars,
  // so a length-based regex would reject valid page-2 cursors.
  const cursor = request.nextUrl.searchParams.get("cursor");
  if (cursor && !decodeUserListCursor(cursor)) {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  }

  const page = await listFriendsForUser({
    viewerId: viewer.id,
    cursor,
    limit: parseLimit(request.nextUrl.searchParams.get("limit")),
  });

  return NextResponse.json(page);
}
