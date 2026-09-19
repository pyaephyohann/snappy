import { prisma } from "@/lib/prisma";

/** Matches admin dashboard recent snaps limit. */
export const ADMIN_RECENT_SNAPS_LIMIT = 6;

/** Home page horizontal strip limit. */
export const HOME_RECENT_SNAPS_LIMIT = 10;

const uploaderNameSelect = {
  select: {
    name: true,
  },
} as const;

const snapWithOwnerSelect = {
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
  uploadedBy: uploaderNameSelect,
} as const;

const snapCardSelect = {
  id: true,
  imageUrl: true,
  caption: true,
  createdAt: true,
  uploadedBy: uploaderNameSelect,
} as const;

export type SnapUploaderSummary = {
  name: string;
} | null;

export type SnapCardFields = {
  id: string;
  imageUrl: string;
  caption: string | null;
  createdAt: Date;
  uploadedBy: SnapUploaderSummary;
};

export type RecentSnapWithUser = SnapCardFields & {
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
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: snapWithOwnerSelect,
  });
}

export async function getAllSnaps(): Promise<RecentSnapWithUser[]> {
  return prisma.snap.findMany({
    orderBy: { createdAt: "desc" },
    select: snapWithOwnerSelect,
  });
}

export async function getSnapsByUserId(
  userId: string,
): Promise<SnapCardFields[]> {
  return prisma.snap.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: snapCardSelect,
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
  uploadedBy: { name: string } | null;
};

export function serializeRecentSnaps(
  snaps: RecentSnapWithUser[],
): PublicRecentSnap[] {
  return snaps.map((snap) => ({
    ...snap,
    createdAt: snap.createdAt.toISOString(),
  }));
}

/** Shared home feed loader (web home + Telegram Mini App). */
export async function loadRecentSnapsForHome(): Promise<
  PublicRecentSnap[] | null
> {
  try {
    const snaps = await getRecentSnaps(HOME_RECENT_SNAPS_LIMIT);
    if (snaps.length === 0) {
      return null;
    }
    return serializeRecentSnaps(snaps);
  } catch (error) {
    console.error("[Recent Snaps] Failed to load:", error);
    return null;
  }
}
