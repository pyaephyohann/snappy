import { NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { getRelationshipState, targetUserExists } from "@/lib/relationships";

function isValidUserId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const viewer = await getAuthenticatedAppUser();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId: targetUserId } = await params;
  if (!isValidUserId(targetUserId)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }
  if (!(await targetUserExists(targetUserId))) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(
    await getRelationshipState(viewer.id, targetUserId),
  );
}
