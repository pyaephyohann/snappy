import { redirect } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import ProfilePageClient from "@/components/profile/ProfilePageClient";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { getLinkedAccountByUserId } from "@/lib/telegram/account";
import { listUploadedSnapsForUser } from "@/lib/profile-snaps";
import { resolveProfileImageUrl } from "@/lib/user-profile";
import { prisma } from "@/lib/prisma";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ openPhotoPicker?: string }>;
}) {
  const user = await getAuthenticatedAppUser();
  if (!user) {
    redirect("/");
  }

  const params = await searchParams;
  const openPhotoPicker = params.openPhotoPicker === "1";

  const [telegramLink, snapCountRow, galleryUnlock, uploadedSnaps] =
    await Promise.all([
      getLinkedAccountByUserId(user.id),
      prisma.user.findUnique({
        where: { id: user.id },
        select: { _count: { select: { snaps: true } } },
      }),
      prisma.user.findUnique({
        where: { id: user.id },
        select: { profilePhotoGalleryUnlockedAt: true },
      }),
      listUploadedSnapsForUser(user.id),
    ]);

  const profileImage = resolveProfileImageUrl(
    user.profileImage,
    user.profileImageSnap?.imageUrl,
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar username={user.name} profileImage={profileImage} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <h1 className="mb-6 text-xl font-semibold text-foreground sm:text-2xl">
          Profile
        </h1>
        <ProfilePageClient
          initial={{
            id: user.id,
            name: user.name,
            profileImage,
            profileImageSnapId: user.profileImageSnap?.id ?? null,
            snapCount: snapCountRow?._count.snaps ?? 0,
            createdAt: user.createdAt.toISOString(),
            lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
            telegramConnected: Boolean(telegramLink),
            telegramUsername: telegramLink?.telegramUsername ?? null,
            profilePhotoGalleryUnlocked: Boolean(
              galleryUnlock?.profilePhotoGalleryUnlockedAt,
            ),
            uploadedSnaps,
          }}
          openPhotoPicker={openPhotoPicker}
        />
      </main>
    </div>
  );
}
