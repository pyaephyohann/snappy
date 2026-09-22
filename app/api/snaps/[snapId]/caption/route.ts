import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { getSparkUsageSummary, SparkServiceError } from "@/lib/spark-service";
import type { SparkUsageSummary } from "@/lib/spark-usage";
import { updateSnapCaptionWithSparkAccounting } from "@/lib/snap-caption-service";
import { SNAP_MAX_CAPTION_LENGTH } from "@/lib/snap-media";

const updateSnapCaptionSchema = z.object({
  caption: z
    .string()
    .max(
      SNAP_MAX_CAPTION_LENGTH,
      `Caption must be less than ${SNAP_MAX_CAPTION_LENGTH} characters`,
    )
    .nullable(),
  /** Stable key for one logical caption edit; required for retry safety. */
  idempotencyKey: z.string().min(1).max(128),
});

/**
 * Update only the caption of a Snap the session user uploaded.
 *
 * Authorization, the 2-Spark debit, and the caption update are handled by
 * one database transaction in `lib/snap-caption-service.ts`. The server
 * remains authoritative if the UI's displayed balance is stale.
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

    const result = await updateSnapCaptionWithSparkAccounting({
      userId: user.id,
      snapId,
      caption,
      idempotencyKey,
    });

    // Return the same server-authoritative usage projection used by S2. If
    // this read fails, the edit still succeeded and the client can refetch.
    let usage: SparkUsageSummary | null = null;
    try {
      usage = await getSparkUsageSummary(user.id);
    } catch (usageError) {
      console.error("Spark usage summary error after caption edit:", usageError);
    }

    return NextResponse.json({
      snap: {
        id: result.snap.id,
        caption: result.snap.caption,
        updatedAt: result.snap.updatedAt.toISOString(),
      },
      spark: {
        sparkSpent: result.sparkSpent,
        idempotent: result.idempotent,
        noOp: result.noOp,
      },
      usage,
    });
  } catch (error) {
    if (error instanceof SparkServiceError) {
      if (error.code === "insufficient_sparks") {
        return NextResponse.json(
          {
            error: "Not enough Sparks to edit this caption",
            code: "insufficient_sparks",
          },
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
