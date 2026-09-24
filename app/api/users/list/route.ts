import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/lib/auth";
import {
  MAX_USER_LIST_PAGE_SIZE,
  USER_LIST_PAGE_SIZE,
  decodeUserListCursor,
  listUsersForViewerPage,
} from "@/lib/relationships";
import { USER_LIST_NEXT_CURSOR_HEADER } from "@/lib/user-list";

/**
 * Authenticated, keyset-paginated list of Snappy users (same data as the home
 * friends grid).
 *
 * The response body stays an array so existing clients keep working; the cursor
 * for the next page is returned in the `X-Next-Cursor` header. A `query`
 * parameter filters by partial name on the server, so search does not require
 * loading the whole user table.
 */
function parseLimit(raw: string | null): number {
  if (!raw) return USER_LIST_PAGE_SIZE;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_USER_LIST_PAGE_SIZE) {
    return USER_LIST_PAGE_SIZE;
  }
  return parsed;
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedAppUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cursor = request.nextUrl.searchParams.get("cursor");
  if (cursor && !decodeUserListCursor(cursor)) {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  }

  const query = (request.nextUrl.searchParams.get("query") ?? "")
    .trim()
    .slice(0, 64);

  const page = await listUsersForViewerPage({
    viewerId: user.id,
    cursor,
    limit: parseLimit(request.nextUrl.searchParams.get("limit")),
    query,
  });

  const response = NextResponse.json(page.users);
  if (page.nextCursor) {
    response.headers.set(USER_LIST_NEXT_CURSOR_HEADER, page.nextCursor);
  }
  return response;
}
