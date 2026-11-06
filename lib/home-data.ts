import { getAutomaticHeroCarousel, type PublicHeroCarouselData } from "@/lib/hero-carousel";
import { getCurrentUserProfileImage } from "@/lib/user-profile";
import {
  listUsersForViewerPage,
  type RelationshipUser,
} from "@/lib/relationships";
import {
  loadRecentSnapsForHome,
  type PublicRecentSnap,
} from "@/lib/recent-snaps";

/** Home shows at most this many people; the list itself is keyset paginated. */
export const HOME_PEOPLE_LIMIT = 50;

export type HomeData = {
  heroCarousel: PublicHeroCarouselData;
  /** Every active Snappy user except the viewer (not only mutual friends). */
  people: RelationshipUser[];
  /** Cursor for the next page of people, or null when the list is complete. */
  peopleNextCursor: string | null;
  profileImage: string;
  snaps: PublicRecentSnap[] | null;
};

export async function getHomeDataForUser(userId: string): Promise<HomeData> {
  const [heroCarousel, peoplePage, profileImage, snaps] = await Promise.all([
    getAutomaticHeroCarousel(),
    // People directory: all active users, with the viewer excluded in the query
    // so their own account is never offered as someone else to visit.
    listUsersForViewerPage({
      viewerId: userId,
      excludeUserId: userId,
      limit: HOME_PEOPLE_LIMIT,
    }),
    getCurrentUserProfileImage(userId),
    loadRecentSnapsForHome(),
  ]);

  return {
    heroCarousel,
    people: peoplePage.users,
    peopleNextCursor: peoplePage.nextCursor,
    profileImage,
    snaps,
  };
}
