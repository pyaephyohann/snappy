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

/** Return users with relationship state in one database query, avoiding N+1 calls. */
export async function listUsersForViewer(viewerId: string): Promise<RelationshipUser[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true },
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
  });

  return users.map(({ followers, following, ...user }) => {
    const isFollowing = followers.length > 0;
    const isFollowedBy = following.length > 0;
    return {
      ...user,
      relationship: relationshipStateFromFlags(isFollowing, isFollowedBy),
    };
  });
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
    users: page.map(({ followers, following, ...user }) => ({
      ...user,
      relationship: relationshipStateFromFlags(
        followers.length > 0,
        following.length > 0,
      ),
    })),
    nextCursor,
  };
}

export async function targetUserExists(targetUserId: string): Promise<boolean> {
  const user = await prisma.user.findFirst({
    where: { id: targetUserId, isActive: true },
    select: { id: true },
  });
  return Boolean(user);
}
