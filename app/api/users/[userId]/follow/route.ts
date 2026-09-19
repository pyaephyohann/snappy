import { NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRelationshipState, targetUserExists } from "@/lib/relationships";
import { isSocialMutationRateLimited } from "@/lib/social-rate-limit";

function isValidUserId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

async function relationshipResponse(viewerId: string, targetUserId: string) {
  return NextResponse.json(
    await getRelationshipState(viewerId, targetUserId),
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const viewer = await getAuthenticatedAppUser();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mutationKey = `${viewer.id}:${request.headers.get("x-forwarded-for") ?? "unknown"}`;
  if (isSocialMutationRateLimited(mutationKey)) {
    return NextResponse.json(
      { error: "Too many relationship changes. Please try again later." },
      { status: 429 },
    );
  }

  const { userId: targetUserId } = await params;
  if (!isValidUserId(targetUserId)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }
  if (viewer.id === targetUserId) {
    return NextResponse.json(
      { error: "You cannot follow yourself" },
      { status: 400 },
    );
  }
  if (!(await targetUserExists(targetUserId))) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    await prisma.userFollow.create({
      data: {
        followerId: viewer.id,
        followingId: targetUserId,
      },
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      // Duplicate follows are safe and idempotent from the client's perspective.
    } else {
      console.error("Follow creation error:", error);
      return NextResponse.json(
        { error: "Could not follow user" },
        { status: 500 },
      );
    }
  }

  return relationshipResponse(viewer.id, targetUserId);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const viewer = await getAuthenticatedAppUser();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mutationKey = `${viewer.id}:${request.headers.get("x-forwarded-for") ?? "unknown"}`;
  if (isSocialMutationRateLimited(mutationKey)) {
    return NextResponse.json(
      { error: "Too many relationship changes. Please try again later." },
      { status: 429 },
    );
  }

  const { userId: targetUserId } = await params;
  if (!isValidUserId(targetUserId)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }
  if (viewer.id === targetUserId) {
    return NextResponse.json(
      { error: "You cannot unfollow yourself" },
      { status: 400 },
    );
  }
  if (!(await targetUserExists(targetUserId))) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await prisma.userFollow.deleteMany({
    where: {
      followerId: viewer.id,
      followingId: targetUserId,
    },
  });

  return relationshipResponse(viewer.id, targetUserId);
}
