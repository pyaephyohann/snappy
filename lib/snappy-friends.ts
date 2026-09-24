import { prisma } from "@/lib/prisma";

export type SnappyFriendSummary = {
  id: string;
  name: string;
};

/** Maximum number of bot "friends" returned in a single invocation. */
export const SNAPPY_FRIENDS_PAGE_SIZE = 50;

/**
 * Canonical Snappy "friends" list: other active users (same as home / users list API).
 *
 * Bounded on purpose: this used to load the entire active-user table into a bot
 * invocation. Callers that need a specific name pass `query`, which filters in
 * the database, so any user stays reachable without a full table scan.
 */
export async function listSnappyFriendsForUser(
  userId: string,
  options: {
    query?: string | null;
    limit?: number;
  } = {},
): Promise<SnappyFriendSummary[]> {
  const requestedLimit = options.limit ?? SNAPPY_FRIENDS_PAGE_SIZE;
  const limit = Math.min(
    Math.max(Number.isInteger(requestedLimit) ? requestedLimit : SNAPPY_FRIENDS_PAGE_SIZE, 1),
    SNAPPY_FRIENDS_PAGE_SIZE,
  );
  const query = options.query?.trim() ?? "";

  return prisma.user.findMany({
    where: {
      isActive: true,
      id: { not: userId },
      ...(query
        ? { name: { contains: query, mode: "insensitive" as const } }
        : {}),
    },
    select: {
      id: true,
      name: true,
    },
    orderBy: { name: "asc" },
    take: limit,
  });
}

/**
 * Exact membership check for bot flows that validate a previously selected
 * target (e.g. the Telegram upload target stored in chat state).
 *
 * A targeted lookup replaces "load every user and `.some()`" so validation stays
 * exact for any user base instead of depending on a bounded list.
 */
export async function getSnappyFriendTarget(
  userId: string,
  targetUserId: string,
): Promise<SnappyFriendSummary | null> {
  if (userId === targetUserId) return null;

  const target = await prisma.user.findFirst({
    where: { id: targetUserId, isActive: true },
    select: { id: true, name: true },
  });

  return target ?? null;
}

/** Boolean form of {@link getSnappyFriendTarget} for validation-only paths. */
export async function isSnappyFriendTarget(
  userId: string,
  targetUserId: string,
): Promise<boolean> {
  return (await getSnappyFriendTarget(userId, targetUserId)) !== null;
}
