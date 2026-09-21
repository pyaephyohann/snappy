import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SNAP_MAX_CAPTION_LENGTH } from "@/lib/snap-media";
import {
  atomicSpendSparks,
  SparkServiceError,
} from "@/lib/spark-service";

const updateSnapCaptionSchema = z.object({
  caption: z
    .string()
    .max(
      SNAP_MAX_CAPTION_LENGTH,
      `Caption must be less than ${SNAP_MAX_CAPTION_LENGTH} characters`,
    )
    .nullable(),
  /**
   * Client-generated idempotency key for retry safety.
   * If omitted, the snap ID is used (each snap can only be edited once
   * for Spark purposes — idempotent by nature).
   */
  idempotencyKey: z.string().min(1).max(128).optional(),
});

/**
 * Update only the caption of a Snap the session user uploaded.
 *
 * Ownership is the uploader attribution (Snap.uploadedById) — never
 * Snap.userId, which is the profile owner the Snap was posted to. Image,
 * publicId, userId and uploadedById are never writable here.
 *
 * Spark spending and caption update are atomic: if the update fails,
 * no Sparks are consumed.
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

    const { caption: rawCaption, idempotencyKey } = validation.data;
    const caption =
      rawCaption && rawCaption.trim().length > 0 ? rawCaption.trim() : null;

    // Use client-supplied idempotency key, or fall back to snap ID
    // (each snap edit is uniquely identified by snap ID).
    const editIdempotencyKey = idempotencyKey ?? snapId;

    // --- Atomic transaction: authorization + Spark spend + caption update ---
    const result = await prisma.$transaction(async (tx) => {
      // 1. Verify authorized Snap (ownership check).
      const snap = await tx.snap.findUnique({
        where: { id: snapId },
        select: { id: true, uploadedById: true },
      });

      if (!snap) {
        throw new SparkServiceError("invalid_operation", "snap_not_found");
      }

      if (snap.uploadedById !== user.id) {
        throw new SparkServiceError("unauthorized", "not_upload_owner");
      }

      // 2. Spend required Sparks (atomic, with idempotency).
      const spendResult = await atomicSpendSparks(tx, {
        userId: user.id,
        type: "CAPTION_EDIT",
        referenceId: editIdempotencyKey,
        reason: "caption_edit",
      });

      // 3. Update the caption.
      const updated = await tx.snap.update({
        where: { id: snap.id },
        data: { caption },
        select: { id: true, caption: true, updatedAt: true },
      });

      return {
        snap: updated,
        sparkDeducted: spendResult.amountDeducted > 0,
      };
    });

    return NextResponse.json({
      snap: {
        id: result.snap.id,
        caption: result.snap.caption,
        updatedAt: result.snap.updatedAt.toISOString(),
      },
      spark: {
        sparkDeducted: result.sparkDeducted,
      },
    });
  } catch (error) {
    if (error instanceof SparkServiceError) {
      if (error.code === "insufficient_sparks") {
        return NextResponse.json(
          { error: "Not enough Sparks to edit this caption" },
          { status: 403 },
        );
      }
      if (error.message === "snap_not_found") {
        return NextResponse.json(
          { error: "Snap not found" },
          { status: 404 },
        );
      }
      if (error.message === "not_upload_owner") {
        return NextResponse.json(
          { error: "You can only edit captions on Snaps you uploaded" },
          { status: 403 },
        );
      }
    }

    console.error("Snap caption update error:", error);
    return NextResponse.json(
      { error: "Failed to update caption" },
      { status: 500 },
    );
  }
}
