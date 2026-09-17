import type { PublicHeroCarouselSlide } from "@/lib/hero-carousel";

/**
 * Payment provider slides for the premium profile-photo payment page.
 * Images are local files served from public/images/payments.
 */
export const PREMIUM_PROFILE_PHOTO_PAYMENT_SLIDES: PublicHeroCarouselSlide[] = [
  {
    id: "payment-kpay",
    imageUrl: "/images/payments/k-pay.JPG",
    altText: "KPay",
    sortOrder: 0,
  },
  {
    id: "payment-aya",
    imageUrl: "/images/payments/aya-pay.JPG",
    altText: "AYA Pay",
    sortOrder: 1,
  },
  {
    id: "payment-uab",
    imageUrl: "/images/payments/uab-pay.JPG",
    altText: "UAB Pay",
    sortOrder: 2,
  },
];

export const PREMIUM_PROFILE_PHOTO_PAYMENT_METHODS = [
  { id: "kpay", label: "KPay", slideIndex: 0 },
  { id: "aya", label: "AYA Pay", slideIndex: 1 },
  { id: "uab", label: "UAB Pay", slideIndex: 2 },
] as const;

export type PremiumProfilePhotoPaymentMethodId =
  (typeof PREMIUM_PROFILE_PHOTO_PAYMENT_METHODS)[number]["id"];

export function slideIndexForProfilePhotoPaymentMethod(
  methodId: PremiumProfilePhotoPaymentMethodId,
): number {
  const method = PREMIUM_PROFILE_PHOTO_PAYMENT_METHODS.find(
    (entry) => entry.id === methodId,
  );
  return method?.slideIndex ?? 0;
}

export function paymentMethodIdForSlideIndex(
  slideIndex: number,
): PremiumProfilePhotoPaymentMethodId {
  const method =
    PREMIUM_PROFILE_PHOTO_PAYMENT_METHODS.find(
      (entry) => entry.slideIndex === slideIndex,
    ) ?? PREMIUM_PROFILE_PHOTO_PAYMENT_METHODS[0];
  return method.id;
}
