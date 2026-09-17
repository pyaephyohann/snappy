"use client";

import HeroCarousel from "@/components/home/HeroCarousel";
import {
  PREMIUM_PROFILE_PHOTO_PAYMENT_METHODS,
  PREMIUM_PROFILE_PHOTO_PAYMENT_SLIDES,
} from "@/lib/premium-profile-photo-payment";

interface PremiumFeaturePaymentClientProps {
  featureTitle: string;
}

export default function PremiumFeaturePaymentClient({
  featureTitle,
}: PremiumFeaturePaymentClientProps) {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-medium text-primary">Premium</p>
        <h1 className="mt-1 text-xl font-semibold text-foreground sm:text-2xl">
          {featureTitle}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Direct profile photo upload is not available yet. When it launches,
          you&apos;ll pay with one of the methods below. No charge is processed
          in this preview.
        </p>
      </div>

      <HeroCarousel
        title="Payment methods"
        slides={PREMIUM_PROFILE_PHOTO_PAYMENT_SLIDES}
      />

      <section aria-label="Supported payment providers">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Available at launch
        </h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {PREMIUM_PROFILE_PHOTO_PAYMENT_METHODS.map((method) => (
            <li
              key={method.id}
              className="rounded-xl border border-border bg-card px-4 py-4 text-center text-sm font-medium text-foreground"
            >
              {method.label}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
