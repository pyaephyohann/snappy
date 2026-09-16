import { prisma } from "@/lib/prisma";

export const HERO_CAROUSEL_CONFIG_ID = "default";

export interface PublicHeroCarouselSlide {
  id: string;
  imageUrl: string;
  altText: string;
  sortOrder: number;
}

export interface PublicHeroCarouselData {
  title: string | null;
  slides: PublicHeroCarouselSlide[];
}

function resolveSlideAltText(
  altText: string | null | undefined,
  caption: string | null | undefined,
): string {
  const trimmedAlt = altText?.trim();
  if (trimmedAlt) {
    return trimmedAlt;
  }

  const trimmedCaption = caption?.trim();
  if (trimmedCaption) {
    return trimmedCaption;
  }

  return "Snappy hero banner";
}

export async function getHeroCarouselData(): Promise<PublicHeroCarouselData> {
  const [config, slides] = await Promise.all([
    prisma.heroCarouselConfig.findUnique({
      where: { id: HERO_CAROUSEL_CONFIG_ID },
    }),
    prisma.heroCarouselSlide.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        snap: {
          select: {
            imageUrl: true,
            caption: true,
          },
        },
      },
    }),
  ]);

  return {
    title: config?.title ?? null,
    slides: slides.map((slide) => ({
      id: slide.id,
      imageUrl: slide.snap.imageUrl,
      altText: resolveSlideAltText(slide.altText, slide.snap.caption),
      sortOrder: slide.sortOrder,
    })),
  };
}
