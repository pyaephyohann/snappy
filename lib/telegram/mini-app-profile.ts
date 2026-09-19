import { getAuthenticatedAppUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLinkedAccountByUserId } from "@/lib/telegram/account";
import { listUploadedSnapsForUser } from "@/lib/profile-snaps";
import { resolveProfileImageUrl } from "@/lib/user-profile";

export type MiniAppProfilePayload = {
  id: string;
  name: string;
  profileImage: string;
  profileImageSnapId: string | null;
  snapCount: number;
  createdAt: string;
  lastLoginAt: string | null;
  telegramConnected: boolean;
  telegramUsername: string | null;
  profilePhotoGalleryUnlocked: boolean;
  uploadedSnaps: Awaited<ReturnType<typeof listUploadedSnapsForUser>>;
};

export async function loadMiniAppProfileForSession(): Promise<
  MiniAppProfilePayload | null
> {
  const user = await getAuthenticatedAppUser();
  if (!user) return null;

  const [telegramLink, snapCountRow, galleryUnlock, uploadedSnaps] =
    await Promise.all([
      getLinkedAccountByUserId(user.id),
      prisma.user.findUnique({
        where: { id: user.id },
        select: { _count: { select: { snaps: true } } },
      }),
      prisma.user.findUnique({
        where: { id: user.id },
        select: { profilePhotoGalleryUnlockedAt: true },
      }),
      listUploadedSnapsForUser(user.id),
    ]);

  return {
    id: user.id,
    name: user.name,
    profileImage: resolveProfileImageUrl(
      user.profileImage,
      user.profileImageSnap?.imageUrl,
    ),
    profileImageSnapId: user.profileImageSnap?.id ?? null,
    snapCount: snapCountRow?._count.snaps ?? 0,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    telegramConnected: Boolean(telegramLink),
    telegramUsername: telegramLink?.telegramUsername ?? null,
    profilePhotoGalleryUnlocked: Boolean(
      galleryUnlock?.profilePhotoGalleryUnlockedAt,
    ),
    uploadedSnaps,
  };
}
