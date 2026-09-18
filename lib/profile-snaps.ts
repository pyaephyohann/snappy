import { prisma } from "@/lib/prisma";

/** Matches the profile photo picker cap so profile pages stay bounded. */
export const PROFILE_UPLOADED_SNAPS_LIMIT = 200;

export type ProfileUploadedSnap = {
  id: string;
  imageUrl: string;
  caption: string | null;
  createdAt: string;
  /** Profile owner name — the snap may live on a friend's page. */
  ownerName: string;
  /** True when the snap also lives on the viewer's own profile. */
  onOwnProfile: boolean;
};

/**
 * Snaps uploaded by the given user (Snap.uploadedById), newest first.
 *
 * "Uploaded by" is the uploader attribution — distinct from Snap.userId, which
 * is the profile owner whose page the Snap lives on. Legacy/seeded snaps have a
 * null uploadedById and therefore never appear here.
 */
export async function listUploadedSnapsForUser(
  userId: string,
  limit: number = PROFILE_UPLOADED_SNAPS_LIMIT,
): Promise<ProfileUploadedSnap[]> {
  const snaps = await prisma.snap.findMany({
    where: { uploadedById: userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      imageUrl: true,
      caption: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return snaps.map((snap) => ({
    id: snap.id,
    imageUrl: snap.imageUrl,
    caption: snap.caption,
    createdAt: snap.createdAt.toISOString(),
    ownerName: snap.user.name,
    onOwnProfile: snap.user.id === userId,
  }));
}
