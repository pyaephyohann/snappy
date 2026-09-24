import { getAutomaticHeroCarousel, type PublicHeroCarouselData } from "@/lib/hero-carousel";
import { getCurrentUserProfileImage } from "@/lib/user-profile";
import {
  listUsersForViewer,
  type RelationshipUser,
} from "@/lib/relationships";
import {
  loadRecentSnapsForHome,
  type PublicRecentSnap,
} from "@/lib/recent-snaps";

/** Home shows at most this many friends; the list itself is keyset paginated. */
export const HOME_FRIENDS_LIMIT = 50;

export type HomeData = {
  heroCarousel: PublicHeroCarouselData;
  friends: RelationshipUser[];
  profileImage: string;
  snaps: PublicRecentSnap[] | null;
};

export async function getHomeDataForUser(userId: string): Promise<HomeData> {
  const [heroCarousel, users, profileImage, snaps] = await Promise.all([
    getAutomaticHeroCarousel(),
    // Bounded first page instead of the entire active-user table. The viewer is
    // excluded in the query, so the cap is still 50 friends rather than 50 users.
    listUsersForViewer(userId, {
      limit: HOME_FRIENDS_LIMIT,
      excludeUserId: userId,
    }),
    getCurrentUserProfileImage(userId),
    loadRecentSnapsForHome(),
  ]);

  return {
    heroCarousel,
    friends: users.filter((u) => u.id !== userId).slice(0, HOME_FRIENDS_LIMIT),
    profileImage,
    snaps,
  };
}
