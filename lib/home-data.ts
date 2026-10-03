import { getAutomaticHeroCarousel, type PublicHeroCarouselData } from "@/lib/hero-carousel";
import { getCurrentUserProfileImage } from "@/lib/user-profile";
import { listFriendsForUser, type RelationshipUser } from "@/lib/relationships";
import {
  loadRecentSnapsForHome,
  type PublicRecentSnap,
} from "@/lib/recent-snaps";

/** Home shows at most this many mutual friends; the list itself is keyset paginated. */
export const HOME_FRIENDS_LIMIT = 50;

export type HomeData = {
  heroCarousel: PublicHeroCarouselData;
  friends: RelationshipUser[];
  profileImage: string;
  snaps: PublicRecentSnap[] | null;
};

export async function getHomeDataForUser(userId: string): Promise<HomeData> {
  const [heroCarousel, friendsPage, profileImage, snaps] = await Promise.all([
    getAutomaticHeroCarousel(),
    // Canonical Friends query: only users who mutually follow the viewer.
    // The bounded first page keeps Home from loading an unbounded friend list.
    listFriendsForUser({ viewerId: userId, limit: HOME_FRIENDS_LIMIT }),
    getCurrentUserProfileImage(userId),
    loadRecentSnapsForHome(),
  ]);

  return {
    heroCarousel,
    friends: friendsPage.users,
    profileImage,
    snaps,
  };
}
