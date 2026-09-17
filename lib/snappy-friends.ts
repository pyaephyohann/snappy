import { prisma } from "@/lib/prisma";

export type SnappyFriendSummary = {
  id: string;
  name: string;
};

/**
 * Canonical Snappy "friends" list: other active users (same as home / users list API).
 */
export async function listSnappyFriendsForUser(
  userId: string,
): Promise<SnappyFriendSummary[]> {
  return prisma.user.findMany({
    where: {
      isActive: true,
      id: { not: userId },
    },
    select: {
      id: true,
      name: true,
    },
    orderBy: { name: "asc" },
  });
}

