import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { assertPasscodeAvailable, hashPasscode } from "@/lib/passcode-utils";
import { prisma } from "@/lib/prisma";
import { updateProfileSchema } from "@/lib/profile-schemas";
import { resolveProfileImageUrl } from "@/lib/user-profile";
import { isPrismaUniqueError } from "@/lib/admin-api";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  const user = await getAuthenticatedAppUser();
  if (!user) {
    return unauthorized();
  }

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      name: true,
      profileImage: true,
      profileImageSnapId: true,
      createdAt: true,
      lastLoginAt: true,
      profileImageSnap: { select: { id: true, imageUrl: true } },
      _count: { select: { snaps: true } },
    },
  });

  if (!record) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      id: record.id,
      name: record.name,
      profileImage: resolveProfileImageUrl(
        record.profileImage,
        record.profileImageSnap?.imageUrl,
      ),
      profileImageSnapId: record.profileImageSnapId,
      snapCount: record._count.snaps,
      createdAt: record.createdAt.toISOString(),
      lastLoginAt: record.lastLoginAt?.toISOString() ?? null,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthenticatedAppUser();
  if (!user) {
    return unauthorized();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request data" }, { status: 400 });
  }

  const validation = updateProfileSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error.issues[0]?.message ?? "Invalid request data" },
      { status: 400 },
    );
  }

  const { name, passcode } = validation.data;
  const data: { name?: string; passcodeHash?: string } = {};

  if (name !== undefined) {
    data.name = name;
  }

  if (passcode !== undefined) {
    const passcodeCheck = await assertPasscodeAvailable(passcode, user.id);
    if (!passcodeCheck.ok) {
      return NextResponse.json({ error: passcodeCheck.error }, { status: 400 });
    }
    data.passcodeHash = await hashPasscode(passcode);
  }

  try {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data,
      select: {
        id: true,
        name: true,
        profileImage: true,
        profileImageSnapId: true,
        profileImageSnap: { select: { id: true, imageUrl: true } },
      },
    });

    return NextResponse.json({
      user: {
        id: updated.id,
        name: updated.name,
        profileImage: resolveProfileImageUrl(
          updated.profileImage,
          updated.profileImageSnap?.imageUrl,
        ),
        profileImageSnapId: updated.profileImageSnapId,
      },
    });
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      return NextResponse.json(
        { error: "This name is already taken" },
        { status: 409 },
      );
    }
    console.error("Profile update error:", error);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 },
    );
  }
}
