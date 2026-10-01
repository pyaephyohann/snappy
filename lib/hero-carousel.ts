import { prisma } from "@/lib/prisma";
import {
  extractMonthDay,
  isInBirthdayWindow,
  toValidatedSlides,
  type PublicHeroCarouselData,
} from "@/lib/hero-carousel-slides";

export const HERO_CAROUSEL_CONFIG_ID = "default";

const LATEST_SNAPS_TITLE = "Latest Snaps";

// Pure slide/birthday helpers and public types live in hero-carousel-slides.ts
// (no Prisma import) and are re-exported here as the canonical banner API.
export {
  extractMonthDay,
  isInBirthdayWindow,
  isValidSlideImageUrl,
  toValidatedSlides,
} from "@/lib/hero-carousel-slides";
export type {
  PublicHeroCarouselData,
  PublicHeroCarouselSlide,
} from "@/lib/hero-carousel-slides";

/**
 * Get today's date components in Asia/Yangon timezone (UTC+6:30).
 */
function getTodayInYangon(): { year: number; month: number; day: number } {
  const now = new Date();
  const yangonTime = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Yangon" }),
  );
  return {
    year: yangonTime.getFullYear(),
    month: yangonTime.getMonth() + 1, // 1-indexed
    day: yangonTime.getDate(),
  };
}

/**
 * Birthday mode (3-day window):
 *   - Title: "Happy Birthday <username>" (or "Happy Birthday <user1> & <user2>" for multiples)
 *   - Slides: ALL snaps uploaded by the birthday user(s)
 *
 * Returns null when no birthday window is active, or when the birthday
 * user(s) have no renderable snaps, so the caller falls through to the next
 * banner source instead of rendering an empty birthday carousel.
 */
async function getBirthdayCarousel(): Promise<PublicHeroCarouselData | null> {
  const today = getTodayInYangon();

  // Find all users with a birthday set
  const usersWithBirthday = await prisma.user.findMany({
    where: {
      birthday: { not: null },
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      birthday: true,
    },
  });

  // Determine which users have a birthday in the current 3-day window
  const birthdayUsers: Array<{ id: string; name: string }> = [];
  for (const user of usersWithBirthday) {
    if (!user.birthday) continue;
    const { month, day } = extractMonthDay(user.birthday);
    if (isInBirthdayWindow(month, day, today)) {
      birthdayUsers.push({ id: user.id, name: user.name });
    }
  }
  if (birthdayUsers.length === 0) return null;

  // Collect ALL snaps uploaded by all birthday users
  const birthdayUserIds = birthdayUsers.map((u) => u.id);
  const birthdaySnaps = await prisma.snap.findMany({
    where: {
      uploadedById: { in: birthdayUserIds },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      imageUrl: true,
      caption: true,
    },
  });

  const slides = toValidatedSlides(birthdaySnaps, "Birthday snap");
  if (slides.length === 0) return null;

  const title =
    birthdayUsers.length === 1
      ? `Happy Birthday ${birthdayUsers[0].name}`
      : `Happy Birthday ${birthdayUsers.map((u) => u.name).join(" & ")}`;

  return { title, slides };
}

/**
 * Admin-configured mode: the HeroCarouselSlide rows managed in
 * Admin → Hero Carousel (ordered by sortOrder), with the optional
 * HeroCarouselConfig title. This is the primary banner source of truth —
 * whatever the admin curated is what the Home banner shows.
 *
 * Returns null when no renderable slide is configured, so the caller can fall
 * back to the automatic Latest Snaps mode.
 */
async function getAdminCarousel(): Promise<PublicHeroCarouselData | null> {
  const [config, slideRows] = await Promise.all([
    prisma.heroCarouselConfig.findUnique({
      where: { id: HERO_CAROUSEL_CONFIG_ID },
    }),
    prisma.heroCarouselSlide.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
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

  const slides = toValidatedSlides(
    slideRows.map((row) => ({
      id: row.id,
      imageUrl: row.snap?.imageUrl,
      altText: row.altText,
      caption: row.snap?.caption,
      sortOrder: row.sortOrder,
    })),
  );
  if (slides.length === 0) return null;

  return {
    title: config?.title?.trim() || null,
    slides,
  };
}

/**
 * Automatic fallback: the newest five Snaps by createdAt, used only when
 * neither a birthday window nor admin-configured slides apply.
 */
async function getLatestSnapsCarousel(): Promise<PublicHeroCarouselData> {
  const latestSnaps = await prisma.snap.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      imageUrl: true,
      caption: true,
    },
  });

  return {
    title: LATEST_SNAPS_TITLE,
    slides: toValidatedSlides(latestSnaps),
  };
}

/**
 * Canonical Home banner resolver — the single source of banner data for both
 * the Web Home page and the Telegram Mini App home API (via
 * `getHomeDataForUser`). Deterministic precedence:
 *
 *   1. Birthday mode — an active 3-day birthday window (Asia/Yangon "today",
 *      month/day extracted in UTC from the stored birthday) wins whenever the
 *      birthday user(s) have at least one renderable snap.
 *   2. Admin-configured slides — HeroCarouselSlide rows (with the optional
 *      HeroCarouselConfig title). The admin configuration is the primary
 *      banner source of truth outside the birthday window.
 *   3. Automatic "Latest Snaps" fallback — the newest five snaps.
 *
 * Every mode drops slide records with missing or invalid image URLs.
 *
 * (The "Automatic" name is kept for the existing home-data contract; this
 * function resolves the full banner precedence above.)
 */
export async function getAutomaticHeroCarousel(): Promise<PublicHeroCarouselData> {
  const birthday = await getBirthdayCarousel();
  if (birthday) return birthday;

  const admin = await getAdminCarousel();
  if (admin) return admin;

  return getLatestSnapsCarousel();
}

/**
 * @deprecated Use getAutomaticHeroCarousel() instead.
 * Kept for backward compatibility during migration.
 */
export async function getHeroCarouselData(): Promise<PublicHeroCarouselData> {
  return getAutomaticHeroCarousel();
}
