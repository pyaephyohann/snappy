import { getAutomaticHeroCarousel, type PublicHeroCarouselData } from "@/lib/hero-carousel";
import { getCurrentUserProfileImage } from "@/lib/user-profile";
import {
  listFriendsForUser,
  type RelationshipUser,
} from "@/lib/relationships";
import {
  loadRecentSnapsForHome,
  type PublicRecentSnap,
} from "@/lib/recent-snaps";

export type HomeData = {
  heroCarousel: PublicHeroCarouselData;
  friends: RelationshipUser[];
  profileImage: string;
  snaps: PublicRecentSnap[] | null;
};

export async function getHomeDataForUser(userId: string): Promise<HomeData> {
  const [heroCarousel, friendsPage, profileImage, snaps] = await Promise.all([
    getAutomaticHeroCarousel(),
    listFriendsForUser({ viewerId: userId, limit: 50 }),
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
