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
  assert.match(homePage, /getHomeDataForUser/);
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

test("Home renders the People directory and the Snap feed", () => {
  const homeData = read("../lib/home-data.ts");
  const homePage = read("../app/home/page.tsx");
  const shared = read("../components/home/HomeContent.tsx");
  const people = read("../components/home/PeopleSection.tsx");

  // People is every active user (viewer excluded), not only mutual friends.
  assert.match(homeData, /listUsersForViewerPage/);
  assert.match(homeData, /excludeUserId: userId/);
  assert.match(homeData, /limit: HOME_PEOPLE_LIMIT/);
  assert.doesNotMatch(homeData, /listFriendsForUser/);
  // The page forwards those people into the shared content component.
  assert.match(homePage, /people={homeData\.people}/);
  assert.match(homePage, /snaps={homeData\.snaps}/);
  assert.match(shared, /PeopleSection/);
  assert.match(people, /FriendCard/);
  assert.match(shared, /RecentSnaps/);
});

test("shared Web/PWA Snap home feed remains horizontal", () => {
  const feed = read("../components/home/RecentSnaps.tsx");
  assert.match(feed, /overflow-x-auto/);
  assert.match(feed, /shrink-0/);
  assert.match(feed, /SnapViewer/);
  assert.doesNotMatch(feed, /IntersectionObserver/);
  assert.doesNotMatch(feed, /flex-col/);
});

test("Telegram Home reuses the shared Web Home content", () => {
  const shared = read("../components/home/HomeContent.tsx");
  const telegram = read("../components/telegram/TelegramMiniAppHome.tsx");
  assert.match(shared, /HeroCarousel/);
  assert.match(shared, /RecentSnaps/);
  assert.match(shared, /PeopleSection/);
  assert.match(shared, /Snap/);
  assert.match(telegram, /HomeContent/);
  assert.match(telegram, /people={state\.data\.people}/);
  assert.doesNotMatch(telegram, /TelegramSnapFeed/);
  assert.doesNotMatch(telegram, /nextCursor/);
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
