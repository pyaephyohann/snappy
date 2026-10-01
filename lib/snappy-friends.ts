import { prisma } from "@/lib/prisma";

export type SnappyFriendSummary = {
  id: string;
  name: string;
};

/** Maximum number of upload recipients returned in a single invocation. */
export const SNAPPY_RECIPIENTS_PAGE_SIZE = 50;

/**
 * Canonical Snap **recipient** list for upload targeting: other active users
 * (same model as `/api/users/list`), NOT the mutual-follow friend list.
 *
 * Upload targeting is a discovery surface — any active Snappy user may receive
 * a Snap addressed to their profile. Actual friends (mutual follows) come from
 * `listFriendsForUser` in `lib/relationships.ts` / `GET /api/friends`.
 *
 * Bounded on purpose: this used to load the entire active-user table into a bot
 * invocation. Callers that need a specific name pass `query`, which filters in
 * the database, so any user stays reachable without a full table scan.
 */
export async function listSnappyRecipientsForUser(
  userId: string,
  options: {
    query?: string | null;
    limit?: number;
  } = {},
): Promise<SnappyFriendSummary[]> {
  const requestedLimit = options.limit ?? SNAPPY_RECIPIENTS_PAGE_SIZE;
  const limit = Math.min(
    Math.max(Number.isInteger(requestedLimit) ? requestedLimit : SNAPPY_RECIPIENTS_PAGE_SIZE, 1),
    SNAPPY_RECIPIENTS_PAGE_SIZE,
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
 * upload recipient (e.g. the target stored in Telegram chat state).
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
