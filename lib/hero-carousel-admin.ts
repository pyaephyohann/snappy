import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HERO_CAROUSEL_CONFIG_ID } from "@/lib/hero-carousel";

export const heroCarouselSlideInclude = {
  snap: {
    select: {
      id: true,
      imageUrl: true,
      caption: true,
      user: {
        select: {
          id: true,
          name: true,
          profileImage: true,
        },
      },
    },
  },
} satisfies Prisma.HeroCarouselSlideInclude;

export function serializeHeroCarouselSlide(
  slide: Prisma.HeroCarouselSlideGetPayload<{
    include: typeof heroCarouselSlideInclude;
  }>,
) {
  return {
    id: slide.id,
    snapId: slide.snapId,
    sortOrder: slide.sortOrder,
    altText: slide.altText,
    createdAt: slide.createdAt,
    updatedAt: slide.updatedAt,
    snap: slide.snap,
  };
}

export async function getHeroCarouselConfigOrDefault() {
  const config = await prisma.heroCarouselConfig.findUnique({
    where: { id: HERO_CAROUSEL_CONFIG_ID },
  });

  if (config) {
    return config;
  }

  return {
    id: HERO_CAROUSEL_CONFIG_ID,
    title: null,
    updatedAt: new Date(0),
  };
}

export async function reassignSlideOrder(
  slideId: string,
  targetSortOrder: number,
) {
  return prisma.$transaction(async (tx) => {
    const slides = await tx.heroCarouselSlide.findMany({
      orderBy: { sortOrder: "asc" },
    });

    const currentIndex = slides.findIndex((slide) => slide.id === slideId);
    if (currentIndex === -1) {
      return null;
    }

    const reordered = [...slides];
    const [moving] = reordered.splice(currentIndex, 1);
    const clampedIndex = Math.max(
      0,
      Math.min(targetSortOrder, reordered.length),
    );
    reordered.splice(clampedIndex, 0, moving);

    await Promise.all(
      reordered.map((slide, index) =>
        tx.heroCarouselSlide.update({
          where: { id: slide.id },
          data: { sortOrder: index },
        }),
      ),
    );

    return tx.heroCarouselSlide.findUnique({
      where: { id: slideId },
      include: heroCarouselSlideInclude,
    });
  });
}

export async function getNextSlideSortOrder() {
  const aggregate = await prisma.heroCarouselSlide.aggregate({
    _max: { sortOrder: true },
  });

  return (aggregate._max.sortOrder ?? -1) + 1;
}
