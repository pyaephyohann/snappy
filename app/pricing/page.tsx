import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Navbar from "@/components/layout/Navbar";
import PricingPageClient from "@/components/pricing/PricingPageClient";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { resolveProfileImageUrl } from "@/lib/user-profile";

export const metadata: Metadata = {
  title: "Pricing · Snappy",
  description:
    "Compare Snappy plans. See your Spark balance, choose a paid plan, and manage your subscription.",
};

export default async function PricingPage() {
  const user = await getAuthenticatedAppUser();
  if (!user) {
    redirect("/");
  }

  const profileImage = resolveProfileImageUrl(
    user.profileImage,
    user.profileImageSnap?.imageUrl,
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar username={user.name} profileImage={profileImage} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <h1 className="mb-6 text-xl font-semibold text-foreground sm:text-2xl">
          Pricing
        </h1>
        <PricingPageClient />
      </main>
    </div>
  );
}
