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

export type HomeData = {
  heroCarousel: PublicHeroCarouselData;
  friends: RelationshipUser[];
  profileImage: string;
  snaps: PublicRecentSnap[] | null;
};

export async function getHomeDataForUser(userId: string): Promise<HomeData> {
  const [heroCarousel, allUsers, profileImage, snaps] = await Promise.all([
    getAutomaticHeroCarousel(),
    listUsersForViewer(userId),
    getCurrentUserProfileImage(userId),
    loadRecentSnapsForHome(),
  ]);

  return {
    heroCarousel,
    friends: allUsers.filter((u) => u.id !== userId).slice(0, 50),
    profileImage,
    snaps,
  };
}
