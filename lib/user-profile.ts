import { prisma } from "@/lib/prisma";

const DEFAULT_AVATAR = "/anya.jpeg";

export function resolveProfileImageUrl(
  profileImage: string,
  snapImageUrl?: string | null,
): string {
  if (snapImageUrl) {
    return snapImageUrl;
  }
  if (profileImage?.trim()) {
    return profileImage;
  }
  return DEFAULT_AVATAR;
}

export async function getUserProfileImageUrl(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      profileImage: true,
      profileImageSnap: { select: { imageUrl: true } },
    },
  });

  if (!user) {
    return DEFAULT_AVATAR;
  }

  return resolveProfileImageUrl(
    user.profileImage,
    user.profileImageSnap?.imageUrl,
  );
}

export async function getCurrentUserProfileImage(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      profileImage: true,
      profileImageSnap: { select: { imageUrl: true } },
    },
  });

  if (!user) {
    return DEFAULT_AVATAR;
  }

  return resolveProfileImageUrl(
    user.profileImage,
    user.profileImageSnap?.imageUrl,
  );
}

export async function syncUserProfileImageFromSnap(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      profileImageSnapId: true,
      profileImageSnap: { select: { imageUrl: true } },
    },
  });

  if (!user?.profileImageSnapId || !user.profileImageSnap) {
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { profileImage: user.profileImageSnap.imageUrl },
  });
}
