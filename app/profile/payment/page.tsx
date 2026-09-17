import Link from "next/link";
import { redirect } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import PremiumFeaturePaymentClient from "@/components/payment/PremiumFeaturePaymentClient";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { getProfilePhotoGalleryUnlockState } from "@/lib/profile-photo-gallery-unlock";

export default async function ProfilePaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ feature?: string }>;
}) {
  const user = await getAuthenticatedAppUser();
  if (!user) {
    redirect("/");
  }

  const params = await searchParams;
  const feature = params.feature ?? "profile-photo";
  if (feature !== "profile-photo") {
    redirect("/profile/payment?feature=profile-photo");
  }

  const galleryUnlock = await getProfilePhotoGalleryUnlockState(user.id);

  return (
    <div className="min-h-screen bg-background">
      <Navbar username={user.name} />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Link
          href="/profile"
          className="mb-4 inline-flex min-h-[44px] items-center text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          ← Back to profile
        </Link>
        <PremiumFeaturePaymentClient
          galleryUploadUnlocked={galleryUnlock.unlocked}
        />
      </main>
    </div>
  );
}
