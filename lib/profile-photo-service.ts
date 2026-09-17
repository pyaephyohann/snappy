import { prisma } from "@/lib/prisma";

export type SetProfilePhotoResult =
  | {
      ok: true;
      profileImage: string;
      profileImageSnapId: string;
    }
  | { ok: false; error: string; status: number };

export async function setUserProfilePhotoFromSnap(
  userId: string,
  snapId: string,
): Promise<SetProfilePhotoResult> {
  const snap = await prisma.snap.findUnique({
    where: { id: snapId },
    select: {
      id: true,
      imageUrl: true,
      userId: true,
    },
  });

  if (!snap) {
    return {
      ok: false,
      error: "Selected snap was not found",
      status: 404,
    };
  }

  if (snap.userId !== userId) {
    return {
      ok: false,
      error: "You can only use your own Snaps as your profile photo",
      status: 403,
    };
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      profileImageSnapId: snap.id,
      profileImage: snap.imageUrl,
    },
  });

  return {
    ok: true,
    profileImage: snap.imageUrl,
    profileImageSnapId: snap.id,
  };
}
