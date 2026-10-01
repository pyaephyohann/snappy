/**
 * Hero Carousel (Home banner) regression tests.
 *
 * Covers the Milestone B1 banner contract:
 * - admin-configured HeroCarousel slides are the primary banner source and
 *   reach HomeContent -> HeroCarousel on both Web and Telegram,
 * - invalid/empty slide records are dropped instead of crashing the carousel,
 * - birthday mode keeps its 3-day Asia/Yangon window and top precedence,
 * - Home stays Snap-feed-only (no Friends section).
 *
 * Run: node --import tsx --test scripts/hero-carousel.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  extractMonthDay,
  isInBirthdayWindow,
  isValidSlideImageUrl,
  toValidatedSlides,
} from "../lib/hero-carousel-slides";

const root = resolve(import.meta.dirname, "..");
function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

test("admin-configured slides are the primary banner source of truth", () => {
  const heroCarousel = read("lib/hero-carousel.ts");

  // The canonical resolver reads the admin models again.
  assert.match(heroCarousel, /heroCarouselConfig\.findUnique/);
  assert.match(heroCarousel, /heroCarouselSlide\.findMany/);

  // Deterministic precedence: birthday -> admin -> automatic Latest Snaps.
  const fnStart = heroCarousel.indexOf(
    "export async function getAutomaticHeroCarousel",
  );
  assert.notEqual(fnStart, -1, "canonical resolver exists");
  const body = heroCarousel.slice(fnStart, heroCarousel.indexOf("\n}", fnStart));
  const birthday = body.indexOf("getBirthdayCarousel()");
  const admin = body.indexOf("getAdminCarousel()");
  const latest = body.indexOf("getLatestSnapsCarousel()");
  assert.notEqual(birthday, -1, "birthday mode is consulted");
  assert.notEqual(admin, -1, "admin slides are consulted");
  assert.notEqual(latest, -1, "automatic fallback exists");
  assert.ok(birthday < admin, "birthday mode outranks admin slides");
  assert.ok(admin < latest, "admin slides outrank the Latest Snaps fallback");

  // The admin fallback returns null when nothing renderable is configured,
  // so empty/invalid admin data can never blank the banner.
  assert.match(heroCarousel, /if \(slides\.length === 0\) return null;/);
});

test("configured banner data reaches Web Home and Telegram Home from one path", () => {
  const homeData = read("lib/home-data.ts");
  const homePage = read("app/home/page.tsx");
  const shared = read("components/home/HomeContent.tsx");
  const telegramRoute = read("app/api/telegram/mini-app/home/route.ts");
  const telegramHome = read("components/telegram/TelegramMiniAppHome.tsx");

  // Exactly one canonical banner resolver call feeds both platforms.
  const calls = homeData.match(/getAutomaticHeroCarousel\(\)/g) ?? [];
  assert.equal(calls.length, 1, "home-data resolves the banner once");

  // Web: RSC page hands the payload to the shared content component.
  assert.match(homeData, /heroCarousel: PublicHeroCarouselData/);
  assert.match(homePage, /heroCarousel=\{homeData\.heroCarousel\}/);
  assert.match(shared, /slides=\{heroCarousel\.slides\}/);
  assert.match(shared, /title=\{heroCarousel\.title\}/);

  // Telegram: same getHomeDataForUser payload, no duplicated banner logic.
  assert.match(telegramRoute, /getHomeDataForUser/);
  assert.doesNotMatch(telegramRoute, /hero-carousel/);
  assert.match(telegramHome, /heroCarousel=\{state\.data\.heroCarousel\}/);
  assert.doesNotMatch(telegramHome, /HeroCarousel|hero-carousel/);
});

test("isValidSlideImageUrl accepts local paths and https URLs only", () => {
  assert.equal(isValidSlideImageUrl("/images/home/banner-1.jpeg"), true);
  assert.equal(isValidSlideImageUrl("https://res.cloudinary.com/x/y.jpg"), true);
  assert.equal(isValidSlideImageUrl("  https://example.com/a.png  "), true);
  assert.equal(isValidSlideImageUrl(""), false);
  assert.equal(isValidSlideImageUrl("   "), false);
  assert.equal(isValidSlideImageUrl(null), false);
  assert.equal(isValidSlideImageUrl(undefined), false);
  assert.equal(isValidSlideImageUrl(42), false);
  assert.equal(isValidSlideImageUrl("ftp://example.com/a.jpg"), false);
  assert.equal(isValidSlideImageUrl("javascript:alert(1)"), false);
  assert.equal(isValidSlideImageUrl("banner.jpg"), false);
});

test("invalid or empty slide records are dropped; valid slides are preserved", () => {
  const slides = toValidatedSlides([
    { id: "a", imageUrl: "", altText: "missing url" },
    { id: "b", imageUrl: null, caption: "null url" },
    { id: "c", imageUrl: "   ", caption: "blank url" },
    { id: "d", imageUrl: "javascript:alert(1)", caption: "bad scheme" },
    {
      id: "e",
      imageUrl: "https://res.cloudinary.com/e.jpg",
      altText: "configured alt",
      caption: "caption e",
      sortOrder: 4,
    },
    {
      id: "f",
      imageUrl: "/images/home/banner-1.jpeg",
      altText: "  ",
      caption: "caption f",
      sortOrder: 5,
    },
    { id: "g", imageUrl: "https://res.cloudinary.com/g.jpg", sortOrder: 6 },
  ]);

  assert.deepEqual(
    slides.map((slide) => slide.id),
    ["e", "f", "g"],
    "valid slides survive in their configured order",
  );
  assert.equal(slides[0].altText, "configured alt", "altText wins");
  assert.equal(slides[1].altText, "caption f", "caption is the fallback");
  assert.equal(
    slides[2].altText,
    "Snappy hero banner",
    "stable default alt text",
  );
  assert.deepEqual(
    slides.map((slide) => slide.sortOrder),
    [4, 5, 6],
    "configured sort order is preserved",
  );

  // Empty input and fully-invalid input never throw and never render.
  assert.deepEqual(toValidatedSlides([]), []);
  assert.deepEqual(
    toValidatedSlides([{ imageUrl: "" }, { imageUrl: null }]),
    [],
    "all-invalid input yields no slides (caller falls through)",
  );

  // A record without an id still renders with a generated, unique id.
  const generated = toValidatedSlides([
    { imageUrl: "https://example.com/1.jpg" },
    { imageUrl: "https://example.com/2.jpg" },
  ]);
  assert.deepEqual(
    generated.map((slide) => slide.id),
    ["slide-0", "slide-1"],
  );
});

test("birthday mode keeps its 3-day window and UTC month/day extraction", () => {
  const heroCarousel = read("lib/hero-carousel.ts");

  // Source contracts: birthday query, title building, and the fallback alt.
  assert.match(heroCarousel, /birthday: \{ not: null \}/);
  assert.match(heroCarousel, /Happy Birthday/);
  assert.match(heroCarousel, /Birthday snap/);

  // 3-day window semantics (month/day only; year ignored): for a Sep 19
  // birthday the window is Sep 19..21 — hold the birthday fixed, vary today.
  assert.equal(isInBirthdayWindow(9, 19, { month: 9, day: 18 }), false, "day before birthday");
  assert.equal(isInBirthdayWindow(9, 19, { month: 9, day: 19 }), true, "birthday day");
  assert.equal(isInBirthdayWindow(9, 19, { month: 9, day: 20 }), true, "day 2");
  assert.equal(isInBirthdayWindow(9, 19, { month: 9, day: 21 }), true, "day 3");
  assert.equal(isInBirthdayWindow(9, 19, { month: 9, day: 22 }), false, "day after window");

  // Year boundary: a Dec 31 birthday window covers Jan 1 and Jan 2.
  assert.equal(isInBirthdayWindow(12, 31, { month: 12, day: 31 }), true);
  assert.equal(isInBirthdayWindow(12, 31, { month: 1, day: 1 }), true);
  assert.equal(isInBirthdayWindow(12, 31, { month: 1, day: 2 }), true);
  assert.equal(isInBirthdayWindow(12, 31, { month: 1, day: 3 }), false);

  // Stored birthdays extract month/day in UTC (unchanged timezone semantics).
  assert.deepEqual(extractMonthDay(new Date("1995-09-19T00:00:00.000Z")), {
    month: 9,
    day: 19,
  });
});

test("Home stays Snap-feed-only with no Friends section", () => {
  const shared = read("components/home/HomeContent.tsx");
  const homePage = read("app/home/page.tsx");
  assert.match(shared, /RecentSnaps/);
  assert.match(shared, /HeroCarousel/);
  assert.doesNotMatch(shared, /FriendCard|friends|Friends/i);
  assert.doesNotMatch(homePage, /friends=\{/);
});

test(
  "getAutomaticHeroCarousel returns a renderable payload",
  { skip: process.env.DATABASE_URL ? false : "DATABASE_URL not set" },
  async () => {
    const { getAutomaticHeroCarousel } = await import("../lib/hero-carousel");
    const data = await getAutomaticHeroCarousel();

    assert.ok(data.title === null || typeof data.title === "string");
    assert.ok(Array.isArray(data.slides));
    for (const slide of data.slides) {
      assert.ok(slide.id.length > 0);
      assert.ok(isValidSlideImageUrl(slide.imageUrl));
      assert.ok(slide.altText.length > 0);
    }
    const ids = data.slides.map((slide) => slide.id);
    assert.deepEqual(ids, [...new Set(ids)], "slide ids are unique");
  },
);
