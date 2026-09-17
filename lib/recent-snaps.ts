import { prisma } from "@/lib/prisma";

/** Matches admin dashboard recent snaps limit. */
export const ADMIN_RECENT_SNAPS_LIMIT = 6;

/** Home page horizontal strip limit. */
export const HOME_RECENT_SNAPS_LIMIT = 10;

export type RecentSnapWithUser = {
  id: string;
  imageUrl: string;
  caption: string | null;
  createdAt: Date;
  user: {
    id: string;
    name: string;
    profileImage: string;
  };
};

export async function getRecentSnaps(
  limit: number,
): Promise<RecentSnapWithUser[]> {
  return prisma.snap.findMany({
    take: limit,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      imageUrl: true,
      caption: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          profileImage: true,
        },
      },
    },
  });
}

export type PublicRecentSnap = {
  id: string;
  imageUrl: string;
  caption: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    profileImage: string;
  };
};

export function serializeRecentSnaps(
  snaps: RecentSnapWithUser[],
): PublicRecentSnap[] {
  return snaps.map((snap) => ({
    ...snap,
    createdAt: snap.createdAt.toISOString(),
  }));
}
