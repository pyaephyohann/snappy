import { prisma } from "@/lib/prisma";
import {
  PREMIUM_PROFILE_PHOTO_PAYMENT_METHODS,
  type PremiumProfilePhotoPaymentMethodId,
} from "@/lib/premium-profile-photo-payment";

export function isPremiumProfilePhotoPaymentMethod(
  value: string,
): value is PremiumProfilePhotoPaymentMethodId {
  return PREMIUM_PROFILE_PHOTO_PAYMENT_METHODS.some(
    (method) => method.id === value,
  );
}

export async function getProfilePhotoGalleryUnlockState(userId: string): Promise<{
  unlocked: boolean;
  unlockedAt: Date | null;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { profilePhotoGalleryUnlockedAt: true },
  });

  return {
    unlocked: Boolean(user?.profilePhotoGalleryUnlockedAt),
    unlockedAt: user?.profilePhotoGalleryUnlockedAt ?? null,
  };
}

export async function completeProfilePhotoGalleryPayment(
  userId: string,
  method: PremiumProfilePhotoPaymentMethodId,
): Promise<{ unlockedAt: Date }> {
  const now = new Date();

  await prisma.$transaction([
    prisma.profilePhotoGalleryPayment.create({
      data: { userId, method },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        profilePhotoGalleryUnlockedAt: now,
      },
    }),
  ]);

  return { unlockedAt: now };
}
