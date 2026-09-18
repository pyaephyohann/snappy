import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SNAP_MAX_CAPTION_LENGTH } from "@/lib/snap-media";

const updateSnapCaptionSchema = z.object({
  caption: z
    .string()
    .max(
      SNAP_MAX_CAPTION_LENGTH,
      `Caption must be less than ${SNAP_MAX_CAPTION_LENGTH} characters`,
    )
    .nullable(),
});

/**
 * Update only the caption of a Snap the session user uploaded.
 *
 * Ownership is the uploader attribution (Snap.uploadedById) — never
 * Snap.userId, which is the profile owner the Snap was posted to. Image,
 * publicId, userId and uploadedById are never writable here.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ snapId: string }> },
) {
  try {
    const user = await getAuthenticatedAppUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { snapId } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request data" }, { status: 400 });
    }

    const validation = updateSnapCaptionSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0]?.message ?? "Invalid request data" },
        { status: 400 },
      );
    }

    const snap = await prisma.snap.findUnique({
      where: { id: snapId },
      select: { id: true, uploadedById: true },
    });

    if (!snap) {
      return NextResponse.json({ error: "Snap not found" }, { status: 404 });
    }

    if (snap.uploadedById !== user.id) {
      return NextResponse.json(
        { error: "You can only edit captions on Snaps you uploaded" },
        { status: 403 },
      );
    }

    const rawCaption = validation.data.caption;
    const caption =
      rawCaption && rawCaption.trim().length > 0 ? rawCaption.trim() : null;

    const updated = await prisma.snap.update({
      where: { id: snap.id },
      data: { caption },
      select: { id: true, caption: true, updatedAt: true },
    });

    return NextResponse.json({
      snap: {
        id: updated.id,
        caption: updated.caption,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Snap caption update error:", error);
    return NextResponse.json(
      { error: "Failed to update caption" },
      { status: 500 },
    );
  }
}
