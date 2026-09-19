import { prisma } from "@/lib/prisma";

const DEFAULT_AVATAR = "/anya.jpeg";

export async function resolveProfileImageSnap(
  profileImageSnapId: string | null | undefined,
): Promise<{ profileImageSnapId: string | null; profileImage?: string }> {
  if (profileImageSnapId === undefined) {
    return { profileImageSnapId: null };
  }

  if (profileImageSnapId === null) {
    return { profileImageSnapId: null, profileImage: DEFAULT_AVATAR };
  }

  const snap = await prisma.snap.findUnique({
    where: { id: profileImageSnapId },
    select: { id: true, imageUrl: true },
  });

  if (!snap) {
    throw new Error("SNAP_NOT_FOUND");
  }

  return {
    profileImageSnapId: snap.id,
    profileImage: snap.imageUrl,
  };
}

export function serializeAdminUser(
  user: {
    id: string;
    name: string;
    role: "USER" | "ADMIN";
    profileImage: string;
    isActive: boolean;
    lastLoginAt: Date | null;
    birthday?: Date | null;
    createdAt: Date;
    updatedAt: Date;
    passcodeHash: string | null;
    _count: { snaps: number };
  },
) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    profileImage: user.profileImage,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    birthday: user.birthday ?? null,
    hasPasscode: Boolean(user.passcodeHash),
    snapCount: user._count.snaps,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
