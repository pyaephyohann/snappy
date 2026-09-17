import { prisma } from "@/lib/prisma";
import {
  validateCloudinarySnapPublicId,
  validateCloudinarySnapUrl,
} from "@/lib/snap-validation";
import { SNAP_MAX_CAPTION_LENGTH } from "@/lib/snap-media";

export type CreateSnapInput = {
  targetUserId: string;
  imageUrl: string;
  publicId: string;
  caption?: string | null;
};

export type CreateSnapResult =
  | {
      ok: true;
      snap: {
        id: string;
        imageUrl: string;
        publicId: string;
        caption: string | null;
        userId: string;
        createdAt: Date;
        updatedAt: Date;
      };
      ownerName: string;
    }
  | { ok: false; error: "invalid_media" | "target_not_found" | "invalid_caption" };

export async function createSnapForUser(
  input: CreateSnapInput,
): Promise<CreateSnapResult> {
  const normalizedCaption =
    input.caption && input.caption.trim().length > 0
      ? input.caption.trim()
      : null;

  if (normalizedCaption && normalizedCaption.length > SNAP_MAX_CAPTION_LENGTH) {
    return { ok: false, error: "invalid_caption" };
  }

  if (!validateCloudinarySnapUrl(input.imageUrl)) {
    return { ok: false, error: "invalid_media" };
  }
  if (!validateCloudinarySnapPublicId(input.publicId)) {
    return { ok: false, error: "invalid_media" };
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: input.targetUserId },
    select: { id: true, name: true, isActive: true },
  });

  if (!targetUser || !targetUser.isActive) {
    return { ok: false, error: "target_not_found" };
  }

  const snap = await prisma.snap.create({
    data: {
      userId: targetUser.id,
      imageUrl: input.imageUrl,
      publicId: input.publicId,
      caption: normalizedCaption,
    },
  });

  return {
    ok: true,
    snap: {
      id: snap.id,
      imageUrl: snap.imageUrl,
      publicId: snap.publicId,
      caption: snap.caption,
      userId: snap.userId,
      createdAt: snap.createdAt,
      updatedAt: snap.updatedAt,
    },
    ownerName: targetUser.name,
  };
}
