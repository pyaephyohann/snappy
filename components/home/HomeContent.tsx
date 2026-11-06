"use client";

import HeroCarousel from "@/components/home/HeroCarousel";
import RecentSnaps from "@/components/home/RecentSnaps";
import PeopleSection from "@/components/home/PeopleSection";
import Navbar from "@/components/layout/Navbar";
import type { PublicHeroCarouselData } from "@/lib/hero-carousel";
import type { PublicRecentSnap } from "@/lib/recent-snaps";
import type { RelationshipUser } from "@/lib/relationships";

interface HomeContentProps {
  username: string;
  profileImage: string;
  heroCarousel: PublicHeroCarouselData;
  /** All active Snappy users except the viewer. */
  people: RelationshipUser[];
  peopleNextCursor?: string | null;
  snaps: PublicRecentSnap[] | null;
  showViewAllLink?: boolean;
}

export default function HomeContent({
  username,
  profileImage,
  heroCarousel,
  people,
  peopleNextCursor = null,
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

        {snaps ? (
          <RecentSnaps
            snaps={snaps}
            showViewAllLink={showViewAllLink}
          />
        ) : null}

        <PeopleSection
          people={people}
          nextCursor={peopleNextCursor}
          showViewAllLink={showViewAllLink}
        />
      </main>
    </div>
  );
}
