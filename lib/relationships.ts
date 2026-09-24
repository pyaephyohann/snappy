import { prisma } from "@/lib/prisma";
import {
  relationshipStateFromFlags,
  type RelationshipState,
} from "@/lib/relationship-state";

export type { RelationshipState } from "@/lib/relationship-state";

export type RelationshipUser = {
  id: string;
  name: string;
  profileImage: string;
  relationship: RelationshipState;
};

export const DEFAULT_RELATIONSHIP: RelationshipState = {
  isFollowing: false,
  isFollowedBy: false,
  isFriend: false,
};

/** Default and maximum page size for the active-user list (keyset paginated). */
export const USER_LIST_PAGE_SIZE = 50;
export const MAX_USER_LIST_PAGE_SIZE = 50;

/** Keyset cursor for the active-user list: `(name asc, id asc)`. */
export type UserListCursor = {
  name: string;
  id: string;
};

export type UserListPage = {
  users: RelationshipUser[];
  nextCursor: string | null;
};

export function encodeUserListCursor(cursor: UserListCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeUserListCursor(value: string | null): UserListCursor | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<UserListCursor>;
    if (
      typeof parsed.name !== "string" ||
      parsed.name.length === 0 ||
      typeof parsed.id !== "string" ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(parsed.id)
    ) {
      return null;
    }
    return { name: parsed.name, id: parsed.id };
  } catch {
    return null;
  }
}

/** Return the relationship from viewerId's perspective. */
export async function getRelationshipState(
  viewerId: string,
  targetUserId: string,
): Promise<RelationshipState> {
  if (viewerId === targetUserId) {
    return {
      isFollowing: false,
      isFollowedBy: false,
      isFriend: false,
    };
  }

  const [outgoing, incoming] = await Promise.all([
    prisma.userFollow.findUnique({
      where: {
        followerId_followingId: {
          followerId: viewerId,
          followingId: targetUserId,
        },
      },
      select: { id: true },
    }),
    prisma.userFollow.findUnique({
      where: {
        followerId_followingId: {
          followerId: targetUserId,
          followingId: viewerId,
        },
      },
      select: { id: true },
    }),
  ]);

  const isFollowing = Boolean(outgoing);
  const isFollowedBy = Boolean(incoming);

  return relationshipStateFromFlags(isFollowing, isFollowedBy);
}

type UserWithRelationshipFlags = {
  id: string;
  name: string;
  profileImage: string;
  followers: { id: string }[];
  following: { id: string }[];
};

function toRelationshipUser({
  followers,
  following,
  ...user
}: UserWithRelationshipFlags): RelationshipUser {
  return {
    ...user,
    relationship: relationshipStateFromFlags(
      followers.length > 0,
      following.length > 0,
    ),
  };
}

/**
 * One keyset-paginated page of active users with relationship state, resolved
 * in a single database query.
 *
 * Previously this returned every active user with no bound. Ordering is
 * `(name asc, id asc)` and the cursor is opaque, so repeated requests stay
 * stable while the user table grows. An optional `query` filters server-side by
 * partial name, which keeps search complete without loading the whole table.
 */
export async function listUsersForViewerPage({
  viewerId,
  cursor = null,
  limit = USER_LIST_PAGE_SIZE,
  query,
  excludeUserId,
}: {
  viewerId: string;
  cursor?: string | null;
  limit?: number;
  query?: string | null;
  excludeUserId?: string | null;
}): Promise<UserListPage> {
  const pageSize = Math.min(
    Math.max(Number.isInteger(limit) ? limit : USER_LIST_PAGE_SIZE, 1),
    MAX_USER_LIST_PAGE_SIZE,
  );
  const decodedCursor = decodeUserListCursor(cursor);
  const trimmedQuery = query?.trim() ?? "";

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      // Excluding in the query keeps callers that need a fixed page size (the
      // home friends grid) from losing a slot to a row filtered out afterwards.
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      ...(trimmedQuery
        ? { name: { contains: trimmedQuery, mode: "insensitive" as const } }
        : {}),
      ...(decodedCursor
        ? {
            OR: [
              { name: { gt: decodedCursor.name } },
              { name: decodedCursor.name, id: { gt: decodedCursor.id } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      profileImage: true,
      followers: {
        where: { followerId: viewerId },
        select: { id: true },
      },
      following: {
        where: { followingId: viewerId },
        select: { id: true },
      },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: pageSize + 1,
  });

  const hasMore = users.length > pageSize;
  const page = hasMore ? users.slice(0, pageSize) : users;
  const last = page[page.length - 1];

  return {
    users: page.map(toRelationshipUser),
    nextCursor:
      hasMore && last
        ? encodeUserListCursor({ name: last.name, id: last.id })
        : null,
  };
}

/**
 * Convenience wrapper returning only the first page of users.
 * Callers that need to walk the whole list should use `listUsersForViewerPage`.
 */
export async function listUsersForViewer(
  viewerId: string,
  options?: {
    cursor?: string | null;
    limit?: number;
    query?: string | null;
    excludeUserId?: string | null;
  },
): Promise<RelationshipUser[]> {
  const page = await listUsersForViewerPage({ viewerId, ...options });
  return page.users;
}

export type FriendPage = {
  users: RelationshipUser[];
  nextCursor: string | null;
};

/** Return only active users who mutually follow viewerId. */
export async function listFriendsForUser({
  viewerId,
  cursor,
  limit = 24,
}: {
  viewerId: string;
  cursor?: string | null;
  limit?: number;
}): Promise<FriendPage> {
  const pageSize = Math.min(Math.max(limit, 1), 50);
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      id: cursor
        ? { gt: cursor, not: viewerId }
        : { not: viewerId },
      followers: { some: { followerId: viewerId } },
      following: { some: { followingId: viewerId } },
    },
    select: {
      id: true,
      name: true,
      profileImage: true,
      followers: {
        where: { followerId: viewerId },
        select: { id: true },
      },
      following: {
        where: { followingId: viewerId },
        select: { id: true },
      },
    },
    orderBy: { id: "asc" },
    take: pageSize + 1,
  });

  const hasMore = users.length > pageSize;
  const page = hasMore ? users.slice(0, pageSize) : users;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  return {
    users: page.map(toRelationshipUser),
    nextCursor,
  };
}

export async function getMutualFriendshipMap(
  viewerId: string,
  targetUserIds: string[],
): Promise<Map<string, boolean>> {
  const uniqueTargetIds = [...new Set(targetUserIds)].filter(
    (targetUserId) => targetUserId !== viewerId,
  );
  const result = new Map(uniqueTargetIds.map((targetUserId) => [targetUserId, false]));
  if (uniqueTargetIds.length === 0) return result;

  const follows = await prisma.userFollow.findMany({
    where: {
      OR: [
        {
          followerId: viewerId,
          followingId: { in: uniqueTargetIds },
        },
        {
          followerId: { in: uniqueTargetIds },
          followingId: viewerId,
        },
      ],
    },
    select: { followerId: true, followingId: true },
  });

  const outgoing = new Set(
    follows
      .filter((follow) => follow.followerId === viewerId)
      .map((follow) => follow.followingId),
  );
  const incoming = new Set(
    follows
      .filter((follow) => follow.followingId === viewerId)
      .map((follow) => follow.followerId),
  );

  for (const targetUserId of uniqueTargetIds) {
    result.set(
      targetUserId,
      outgoing.has(targetUserId) && incoming.has(targetUserId),
    );
  }

  return result;
}

export async function targetUserExists(targetUserId: string): Promise<boolean> {
  const user = await prisma.user.findFirst({
    where: { id: targetUserId, isActive: true },
    select: { id: true },
  });
  return Boolean(user);
}
