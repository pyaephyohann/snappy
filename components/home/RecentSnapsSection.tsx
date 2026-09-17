import RecentSnaps from "@/components/home/RecentSnaps";
import {
  getRecentSnaps,
  HOME_RECENT_SNAPS_LIMIT,
  serializeRecentSnaps,
  type PublicRecentSnap,
} from "@/lib/recent-snaps";

async function loadRecentSnapsForHome(): Promise<PublicRecentSnap[] | null> {
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

export default async function RecentSnapsSection() {
  const snaps = await loadRecentSnapsForHome();
  if (!snaps) {
    return null;
  }
  return <RecentSnaps snaps={snaps} />;
}
