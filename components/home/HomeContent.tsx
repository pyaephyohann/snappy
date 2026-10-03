"use client";

import Link from "next/link";
import HeroCarousel from "@/components/home/HeroCarousel";
import RecentSnaps from "@/components/home/RecentSnaps";
import FriendCard from "@/components/home/FriendCard";
import Navbar from "@/components/layout/Navbar";
import type { PublicHeroCarouselData } from "@/lib/hero-carousel";
import type { PublicRecentSnap } from "@/lib/recent-snaps";
import type { RelationshipUser } from "@/lib/relationships";

interface HomeContentProps {
  username: string;
  profileImage: string;
  heroCarousel: PublicHeroCarouselData;
  friends: RelationshipUser[];
  snaps: PublicRecentSnap[] | null;
  showViewAllLink?: boolean;
}

export default function HomeContent({
  username,
  profileImage,
  heroCarousel,
  friends,
  snaps,
  showViewAllLink = true,
}: HomeContentProps) {
  return (
    <div className="min-h-screen bg-background">
      <Navbar username={username} profileImage={profileImage} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <HeroCarousel
          title={heroCarousel.title}
          slides={heroCarousel.slides}
        />

        {friends.length > 0 ? (
          <section className="mb-8 sm:mb-10">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-foreground sm:text-2xl">
                Friends
              </h2>
              {showViewAllLink ? (
                <Link
                  href="/friends"
                  className="shrink-0 cursor-pointer text-sm font-medium text-primary hover:opacity-90"
                >
                  View All →
                </Link>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4 xl:grid-cols-5">
              {friends.map((friend) => (
                <FriendCard
                  key={friend.id}
                  name={friend.name}
                  profileImage={friend.profileImage}
                />
              ))}
            </div>
          </section>
        ) : null}

        {snaps ? (
          <RecentSnaps
            snaps={snaps}
            showViewAllLink={showViewAllLink}
          />
        ) : null}
      </main>
    </div>
  );
}
