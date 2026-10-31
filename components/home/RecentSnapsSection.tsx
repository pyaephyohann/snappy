import RecentSnaps from "@/components/home/RecentSnaps";
import { loadRecentSnapsForHome } from "@/lib/recent-snaps";

export default async function RecentSnapsSection() {
  const snaps = await loadRecentSnapsForHome();
  if (!snaps) {
    return null;
  }
  return <RecentSnaps snaps={snaps} />;
}
