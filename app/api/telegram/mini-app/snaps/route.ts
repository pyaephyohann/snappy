import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { broadcastNewSnap } from "@/lib/notifications/notification-service";
import {
  createSnapWithSparkAccounting,
  type SnapUploadError,
} from "@/lib/snap-upload-service";
import { telegramMiniAppUnauthorizedResponse } from "@/lib/telegram/mini-app-api";

const createSnapSchema = z.object({
  imageUrl: z.string().url("Invalid image URL"),
  publicId: z.string().min(1, "Public ID is required"),
  caption: z
    .string()
    .max(500, "Caption must be less than 500 characters")
    .optional(),
  /** Client-generated UUID for this logical upload; required for retry safety. */
  idempotencyKey: z.string().min(1).max(128),
});

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedAppUser();
  if (!user) {
    return telegramMiniAppUnauthorizedResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request data" }, { status: 400 });
  }

  const validationResult = createSnapSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json({ error: "Invalid request data" }, { status: 400 });
  }

  const { imageUrl, publicId, caption, idempotencyKey } = validationResult.data;

  // Delegate to the shared upload service (same Spark accounting as Web/PWA).
  let result;
  try {
    result = await createSnapWithSparkAccounting({
      targetUserId: user.id,
      uploadedById: user.id,
      imageUrl,
      publicId,
      caption,
      idempotencyKey,
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      const uploadError = error as { code: SnapUploadError };
      if (uploadError.code === "insufficient_sparks") {
        return NextResponse.json(
          { error: "Not enough Sparks" },
          { status: 403 },
        );
      }
    }
    console.error("Snap creation error:", error);
    return NextResponse.json(
      { error: "Could not create Snap" },
      { status: 400 },
    );
  }

  after(async () => {
    try {
      await broadcastNewSnap({
        snapId: result.snap.id,
        profileOwnerName: result.ownerName,
        uploaderName: result.uploaderName,
      });
    } catch (notifyError) {
      console.error("Snap notification error:", notifyError);
    }
  });

  return NextResponse.json(
    {
      snap: {
        id: result.snap.id,
        imageUrl: result.snap.imageUrl,
        caption: result.snap.caption,
      },
      spark: {
        isFreeUpload: result.isFreeUpload,
        sparkRewardCredited: result.sparkRewardCredited,
      },
      idempotent: result.idempotent,
    },
    { status: 201 },
  );
}
