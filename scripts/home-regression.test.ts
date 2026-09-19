import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(relativePath: string): string {
  return readFileSync(resolve(import.meta.dirname, relativePath), "utf8");
}

test("normal user login still creates a user session and redirects to home", () => {
  const loginRoute = read("../app/api/auth/login/route.ts");
  assert.match(loginRoute, /createSession\(authResult\.username, 'USER', authResult\.userId\)/);
  assert.match(loginRoute, /redirectTo: '\/home'/);
});

test("home uses the automatic carousel and keeps birthday notification fire-and-forget", () => {
  const homePage = read("../app/home/page.tsx");
  assert.match(homePage, /getAutomaticHeroCarousel/);
  assert.match(homePage, /triggerBirthdayNotifications/);
  assert.match(homePage, /void triggerBirthdayNotifications\(\)/);
});

test("automatic carousel contains birthday and latest-snap fallback branches", () => {
  const carousel = read("../lib/hero-carousel.ts");
  assert.match(carousel, /birthday: \{ not: null \}/);
  assert.match(carousel, /Happy Birthday/);
  assert.match(carousel, /Latest Snaps/);
  assert.match(carousel, /take: 5/);
});

test("shared Web/PWA Snap home feed remains horizontal", () => {
  const feed = read("../components/home/RecentSnaps.tsx");
  assert.match(feed, /overflow-x-auto/);
  assert.match(feed, /shrink-0/);
  assert.match(feed, /SnapViewer/);
  assert.doesNotMatch(feed, /IntersectionObserver/);
  assert.doesNotMatch(feed, /flex-col/);
});

test("Telegram home uses its own vertical paginated Snap feed", () => {
  const home = read("../components/telegram/TelegramMiniAppHome.tsx");
  const feed = read("../components/telegram/TelegramSnapFeed.tsx");
  assert.match(home, /TelegramSnapFeed/);
  assert.match(home, /nextCursor/);
  assert.match(feed, /flex-col/);
  assert.match(feed, /IntersectionObserver/);
  assert.match(feed, /SnapCard/);
  assert.match(feed, /SnapViewer/);
  assert.doesNotMatch(feed, /overflow-x-auto/);
  assert.doesNotMatch(feed, /snap-x/);
});

test("the birthday migration and Vercel migration hook are wired", () => {
  const migration = read(
    "../prisma/migrations/20260919100000_user_birthday_and_hero_carousel/migration.sql",
  );
  const vercelConfig = read("../vercel.json");
  assert.match(migration, /ADD COLUMN "birthday"/);
  assert.match(migration, /ADD VALUE 'BIRTHDAY'/);
  assert.match(vercelConfig, /prisma migrate deploy && npm run build/);
});
