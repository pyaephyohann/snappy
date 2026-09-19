"use client";

import HeroCarousel from "@/components/home/HeroCarousel";
import FriendCard from "@/components/home/FriendCard";
import RecentSnaps from "@/components/home/RecentSnaps";
import Navbar from "@/components/layout/Navbar";
import GlowingBorder from "@/components/ui/glowing-border";
import type { PublicHeroCarouselData } from "@/lib/hero-carousel";
import type { PublicRecentSnap } from "@/lib/recent-snaps";
import type { RelationshipUser } from "@/lib/relationships";

interface HomeContentProps {
  username: string;
  profileImage: string;
  heroCarousel: PublicHeroCarouselData;
  friends: RelationshipUser[];
  snaps: PublicRecentSnap[] | null;
  friendPathPrefix?: string;
  showViewAllLink?: boolean;
}

export default function HomeContent({
  username,
  profileImage,
  heroCarousel,
  friends,
  snaps,
  friendPathPrefix = "/friends",
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

        {snaps ? (
          <RecentSnaps
            snaps={snaps}
            showViewAllLink={showViewAllLink}
          />
        ) : null}

        <section>
          <h2 className="text-xl sm:text-2xl font-semibold text-foreground mb-4 sm:mb-6">
            Friends
          </h2>

          {friends.length === 0 ? (
            <GlowingBorder radius="xl">
              <div className="bg-card border border-border rounded-xl p-8 sm:p-12 text-center">
                <p className="text-muted-foreground text-sm sm:text-base">
                  No friends yet. Check back soon!
                </p>
              </div>
            </GlowingBorder>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
              {friends.map((friend) => (
                <FriendCard
                  key={friend.id}
                  name={friend.name}
                  profileImage={friend.profileImage}
                  profilePathPrefix={friendPathPrefix}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
