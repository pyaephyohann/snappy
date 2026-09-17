import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { createSnapForUser } from "@/lib/snap-create-service";
import { setUserProfilePhotoFromSnap } from "@/lib/profile-photo-service";
import { profilePhotoGalleryUploadSchema } from "@/lib/profile-schemas";
import { getProfilePhotoGalleryUnlockState } from "@/lib/profile-photo-gallery-unlock";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedAppUser();
  if (!user) {
    return unauthorized();
  }

  const unlock = await getProfilePhotoGalleryUnlockState(user.id);
  if (!unlock.unlocked) {
    return NextResponse.json(
      { error: "Complete payment to upload from your gallery." },
      { status: 402 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request data" }, { status: 400 });
  }

  const validation = profilePhotoGalleryUploadSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error.issues[0]?.message ?? "Invalid request data" },
      { status: 400 },
    );
  }

  const { imageUrl, publicId } = validation.data;

  const created = await createSnapForUser({
    targetUserId: user.id,
    imageUrl,
    publicId,
  });

  if (!created.ok) {
    return NextResponse.json(
      { error: "Could not save your photo. Please try again." },
      { status: 400 },
    );
  }

  const profileResult = await setUserProfilePhotoFromSnap(
    user.id,
    created.snap.id,
  );

  if (!profileResult.ok) {
    return NextResponse.json(
      { error: profileResult.error },
      { status: profileResult.status },
    );
  }

  return NextResponse.json({
    profileImage: profileResult.profileImage,
    profileImageSnapId: profileResult.profileImageSnapId,
  });
}
