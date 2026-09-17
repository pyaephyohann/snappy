import type { PublicHeroCarouselSlide } from "@/lib/hero-carousel";

/**
 * Marketing slides for premium profile-photo upload (payment UI only — no checkout backend).
 * Images are optional; HeroCarousel falls back to home banners when URLs are missing.
 */
/** Reuses home carousel assets until dedicated payment creatives are added. */
export const PREMIUM_PROFILE_PHOTO_PAYMENT_SLIDES: PublicHeroCarouselSlide[] = [
  {
    id: "payment-kpay",
    imageUrl: "/images/home/banner-1.jpeg",
    altText: "KPay",
    sortOrder: 0,
  },
  {
    id: "payment-aya",
    imageUrl: "/images/home/banner-2.jpeg",
    altText: "AYA Pay",
    sortOrder: 1,
  },
  {
    id: "payment-uab",
    imageUrl: "/images/home/banner-3.jpeg",
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
