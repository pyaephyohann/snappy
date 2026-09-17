import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/lib/auth";
import {
  completeProfilePhotoGalleryPayment,
  getProfilePhotoGalleryUnlockState,
} from "@/lib/profile-photo-gallery-unlock";
import { profilePhotoGalleryPaymentSchema } from "@/lib/profile-schemas";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  const user = await getAuthenticatedAppUser();
  if (!user) {
    return unauthorized();
  }

  const state = await getProfilePhotoGalleryUnlockState(user.id);

  return NextResponse.json({
    unlocked: state.unlocked,
    unlockedAt: state.unlockedAt?.toISOString() ?? null,
  });
}

export async function POST(request: NextRequest) {
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

  const validation = profilePhotoGalleryPaymentSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error.issues[0]?.message ?? "Invalid request data" },
      { status: 400 },
    );
  }

  const existing = await getProfilePhotoGalleryUnlockState(user.id);
  if (existing.unlocked) {
    return NextResponse.json({
      unlocked: true,
      unlockedAt: existing.unlockedAt?.toISOString() ?? null,
    });
  }

  const result = await completeProfilePhotoGalleryPayment(
    user.id,
    validation.data.method,
  );

  return NextResponse.json({
    unlocked: true,
    unlockedAt: result.unlockedAt.toISOString(),
  });
}
