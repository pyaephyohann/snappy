import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { broadcastNewSnap } from "@/lib/notifications/notification-service";
import { createSnapForUser } from "@/lib/snap-create-service";
import { telegramMiniAppUnauthorizedResponse } from "@/lib/telegram/mini-app-api";

const createSnapSchema = z.object({
  imageUrl: z.string().url("Invalid image URL"),
  publicId: z.string().min(1, "Public ID is required"),
  caption: z
    .string()
    .max(500, "Caption must be less than 500 characters")
    .optional(),
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

  const { imageUrl, publicId, caption } = validationResult.data;

  const result = await createSnapForUser({
    targetUserId: user.id,
    uploadedById: user.id,
    imageUrl,
    publicId,
    caption,
  });

  if (!result.ok) {
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
    },
    { status: 201 },
  );
}
