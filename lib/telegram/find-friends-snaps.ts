import { prisma } from "@/lib/prisma";
import { isTelegramSafeImageUrl } from "@/lib/snap-telegram";

export const FIND_FRIENDS_SNAPS_PAGE_SIZE = 3;

export type FriendSnapForTelegram = {
  id: string;
  imageUrl: string;
  caption: string | null;
};

/**
 * Friend profile snaps: newest first (matches /friends/[username] page).
 */
export async function listFriendSnapsForTelegramPage(options: {
  friendUserId: string;
  offset: number;
  limit?: number;
}): Promise<FriendSnapForTelegram[]> {
  const limit = options.limit ?? FIND_FRIENDS_SNAPS_PAGE_SIZE;

  const snaps = await prisma.snap.findMany({
    where: {
      userId: options.friendUserId,
      user: { isActive: true },
    },
    orderBy: { createdAt: "desc" },
    skip: options.offset,
    take: limit,
    select: {
      id: true,
      imageUrl: true,
      caption: true,
    },
  });

  return snaps.filter((snap) => isTelegramSafeImageUrl(snap.imageUrl));
}
