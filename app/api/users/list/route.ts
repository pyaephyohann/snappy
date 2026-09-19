import { NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { listUsersForViewer } from "@/lib/relationships";

/** Authenticated list of Snappy users (same data as home friends grid). */
export async function GET() {
  const user = await getAuthenticatedAppUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await listUsersForViewer(user.id));
}
