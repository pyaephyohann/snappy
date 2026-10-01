/**
 * Pure Hero Carousel (Home banner) slide helpers — no Prisma import, so they
 * are unit-testable without a database.
 *
 * The canonical banner resolver lives in `lib/hero-carousel.ts`, which
 * re-exports these helpers.
 */

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

const DEFAULT_SLIDE_ALT_TEXT = "Snappy hero banner";

/**
 * A slide image is renderable when it is a root-relative local path or an
 * https URL (the only shapes `next/image` accepts here — see
 * `images.remotePatterns` in next.config.ts). Empty, whitespace, non-string,
 * or other schemes are rejected so a malformed row can never crash the
 * carousel.
 */
export function isValidSlideImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const url = value.trim();
  return url.startsWith("/") || url.startsWith("https://");
}

export type RawHeroSlide = {
  id?: unknown;
  imageUrl?: unknown;
  altText?: unknown;
  caption?: unknown;
  sortOrder?: unknown;
};

/**
 * Map raw slide records (admin HeroCarouselSlide rows or Snap rows) to public
 * slides. Records with missing/invalid image URLs are dropped; every valid
 * slide is preserved in its configured order. Alt text falls back from the
 * record's altText to the snap caption to a stable default.
 */
export function toValidatedSlides(
  rawSlides: RawHeroSlide[],
  fallbackAltText: string = DEFAULT_SLIDE_ALT_TEXT,
): PublicHeroCarouselSlide[] {
  const slides: PublicHeroCarouselSlide[] = [];
  for (const raw of rawSlides) {
    if (!isValidSlideImageUrl(raw.imageUrl)) continue;
    const altText = [raw.altText, raw.caption]
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .find(Boolean);
    const id =
      typeof raw.id === "string" && raw.id.trim()
        ? raw.id.trim()
        : `slide-${slides.length}`;
    slides.push({
      id,
      imageUrl: raw.imageUrl.trim(),
      altText: altText ?? fallbackAltText,
      sortOrder:
        typeof raw.sortOrder === "number" ? raw.sortOrder : slides.length,
    });
  }
  return slides;
}

/**
 * Check if today falls within the 3-day birthday window.
 *
 * Window: birthday day, birthday+1, birthday+2 (calendar days).
 * Example: birthday = Sep 19
 *   Sep 19 → active (day 1)
 *   Sep 20 → active (day 2)
 *   Sep 21 → active (day 3)
 *   Sep 22 → not active
 */
export function isInBirthdayWindow(
  birthdayMonth: number,
  birthdayDay: number,
  today: { month: number; day: number },
): boolean {
  // Build the 3-day window starting from the birthday date
  const birthdayBase = new Date(2000, birthdayMonth - 1, birthdayDay);

  for (let offset = 0; offset < 3; offset++) {
    const d = new Date(birthdayBase);
    d.setDate(d.getDate() + offset);
    const windowMonth = d.getMonth() + 1;
    const windowDay = d.getDate();
    if (windowMonth === today.month && windowDay === today.day) {
      return true;
    }
  }

  return false;
}

/**
 * Extract month (1-12) and day (1-31) from a Date stored as birthday.
 * The year is ignored — only month+day matters for birthday comparison.
 */
export function extractMonthDay(birthday: Date): { month: number; day: number } {
  // Use UTC to avoid timezone drift on the stored date
  return {
    month: birthday.getUTCMonth() + 1,
    day: birthday.getUTCDate(),
  };
}
