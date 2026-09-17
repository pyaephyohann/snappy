"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeroCarousel from "@/components/home/HeroCarousel";
import {
  PREMIUM_PROFILE_PHOTO_PAYMENT_METHODS,
  PREMIUM_PROFILE_PHOTO_PAYMENT_SLIDES,
  paymentMethodIdForSlideIndex,
  slideIndexForProfilePhotoPaymentMethod,
  type PremiumProfilePhotoPaymentMethodId,
} from "@/lib/premium-profile-photo-payment";

interface PremiumFeaturePaymentClientProps {
  galleryUploadUnlocked: boolean;
}

export default function PremiumFeaturePaymentClient({
  galleryUploadUnlocked,
}: PremiumFeaturePaymentClientProps) {
  const router = useRouter();
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PremiumProfilePhotoPaymentMethodId>("kpay");

  const activeSlideIndex = useMemo(
    () => slideIndexForProfilePhotoPaymentMethod(selectedPaymentMethod),
    [selectedPaymentMethod],
  );

  const handleCompletePayment = async () => {
    // Presentational only for the profile-photo flow: payment processing is
    // intentionally not wired up yet. Keep the button non-functional.
  };

  if (galleryUploadUnlocked) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm font-medium text-primary">Profile glow-up ✨</p>
          <h1 className="mt-1 text-xl font-semibold text-foreground sm:text-2xl">
            Change your profile picture
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            You&apos;re all set! Pick a photo from your gallery on your profile.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/profile?openPhotoPicker=1")}
          className="min-h-[44px] rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Choose from gallery
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-medium text-primary">Profile glow-up ✨</p>
        <h1 className="mt-1 text-xl font-semibold text-foreground sm:text-2xl">
          Change your profile picture
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Give your profile a fresh new look! Complete the payment to unlock
          your profile picture change — then choose a photo from your gallery.
        </p>
      </div>

      <HeroCarousel
        slides={PREMIUM_PROFILE_PHOTO_PAYMENT_SLIDES}
        activeSlideIndex={activeSlideIndex}
        onActiveSlideIndexChange={(index) => {
          setSelectedPaymentMethod(paymentMethodIdForSlideIndex(index));
        }}
        autoPlay={false}
      />

      <section aria-label="Choose payment method">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Choose how to pay
        </h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {PREMIUM_PROFILE_PHOTO_PAYMENT_METHODS.map((method) => {
            const isSelected = selectedPaymentMethod === method.id;
            return (
              <li key={method.id}>
                <button
                  type="button"
                  onClick={() => setSelectedPaymentMethod(method.id)}
                  className={`min-h-[44px] w-full rounded-xl border px-4 py-4 text-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isSelected
                      ? "border-primary bg-primary/10 text-foreground shadow-sm ring-2 ring-primary/20"
                      : "border-border bg-card text-foreground hover:bg-muted/60"
                  }`}
                  aria-pressed={isSelected}
                >
                  {method.label}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => void handleCompletePayment()}
          className="min-h-[44px] w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 sm:w-auto sm:min-w-[12rem]"
        >
          {`Pay with ${PREMIUM_PROFILE_PHOTO_PAYMENT_METHODS.find((m) => m.id === selectedPaymentMethod)?.label ?? "selected method"}`}
        </button>
      </div>
    </div>
  );
}
