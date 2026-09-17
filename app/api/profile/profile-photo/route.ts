import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProfilePhotoGalleryUnlockState } from "@/lib/profile-photo-gallery-unlock";
import { setUserProfilePhotoFromSnap } from "@/lib/profile-photo-service";
import { updateProfilePhotoSchema } from "@/lib/profile-schemas";
import { resolveProfileImageUrl } from "@/lib/user-profile";

const PROFILE_PHOTO_SNAP_LIMIT = 200;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  const user = await getAuthenticatedAppUser();
  if (!user) {
    return unauthorized();
  }

  const [profileUser, snaps, galleryUnlock] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        profileImage: true,
        profileImageSnapId: true,
        profileImageSnap: { select: { id: true, imageUrl: true } },
      },
    }),
    prisma.snap.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: PROFILE_PHOTO_SNAP_LIMIT,
      select: {
        id: true,
        imageUrl: true,
        caption: true,
        createdAt: true,
      },
    }),
    getProfilePhotoGalleryUnlockState(user.id),
  ]);

  if (!profileUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      profileImage: resolveProfileImageUrl(
        profileUser.profileImage,
        profileUser.profileImageSnap?.imageUrl,
      ),
      profileImageSnapId: profileUser.profileImageSnapId,
    },
    snaps: snaps.map((snap) => ({
      ...snap,
      createdAt: snap.createdAt.toISOString(),
    })),
    galleryUploadUnlocked: galleryUnlock.unlocked,
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

  const validation = updateProfilePhotoSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error.issues[0]?.message ?? "Invalid request data" },
      { status: 400 },
    );
  }

  const result = await setUserProfilePhotoFromSnap(
    user.id,
    validation.data.snapId,
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json({
    profileImage: result.profileImage,
    profileImageSnapId: result.profileImageSnapId,
  });
}
