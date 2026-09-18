import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import Navbar from "@/components/layout/Navbar";
import SnapGallery from "@/components/friends/SnapGallery";
import { getAllSnaps } from "@/lib/recent-snaps";
import { getCurrentUserProfileImage } from "@/lib/user-profile";

export default async function SnapsPage() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  let snaps: Awaited<ReturnType<typeof getAllSnaps>> = [];
  try {
    snaps = await getAllSnaps();
  } catch (error) {
    console.error("[Snaps page] Failed to load snaps:", error);
  }

  const profileImage = session.userId
    ? await getCurrentUserProfileImage(session.userId)
    : "/anya.jpeg";

  const gallerySnaps = snaps.map((snap) => ({
    id: snap.id,
    imageUrl: snap.imageUrl,
    caption: snap.caption,
    createdAt: snap.createdAt.toISOString(),
    friendName: snap.user.name,
    uploaderName: snap.uploadedBy?.name ?? null,
  }));

  return (
    <div className="min-h-screen bg-background">
      <Navbar username={session.username} profileImage={profileImage} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <h1 className="mb-4 text-xl font-semibold text-foreground sm:mb-6 sm:text-2xl">
          Snaps
        </h1>

        {gallerySnaps.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground sm:text-base">
              No snaps yet. New uploads will show up here.
            </p>
          </div>
        ) : (
          <SnapGallery snaps={gallerySnaps} />
        )}
      </main>
    </div>
  );
}
