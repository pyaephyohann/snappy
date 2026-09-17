import { getAuthenticatedAppUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLinkedAccountByUserId } from "@/lib/telegram/account";
import { resolveProfileImageUrl } from "@/lib/user-profile";

export type MiniAppProfilePayload = {
  displayName: string;
  profileImageUrl: string;
  memberSince: string;
  snapCount: number;
  telegram: {
    connected: boolean;
    username: string | null;
  };
};

export async function loadMiniAppProfileForSession(): Promise<
  MiniAppProfilePayload | null
> {
  const user = await getAuthenticatedAppUser();
  if (!user) {
    return null;
  }

  const [telegramLink, snapCount] = await Promise.all([
    getLinkedAccountByUserId(user.id),
    prisma.snap.count({ where: { userId: user.id } }),
  ]);

  return {
    displayName: user.name,
    profileImageUrl: resolveProfileImageUrl(
      user.profileImage,
      user.profileImageSnap?.imageUrl,
    ),
    memberSince: user.createdAt.toISOString(),
    snapCount,
    telegram: {
      connected: Boolean(telegramLink),
      username: telegramLink?.telegramUsername ?? null,
    },
  };
}
