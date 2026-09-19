/**
 * Telegram Mini App home + navigation (Node test runner).
 * Run: npm run test:telegram-mini-app-home
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  TELEGRAM_MINI_APP_ROUTES,
  isTelegramMiniAppRootPath,
  resolveTelegramMiniAppScreenPath,
} from "../lib/telegram/mini-app-routes";

test("mini app routes define home find upload profile", () => {
  assert.equal(TELEGRAM_MINI_APP_ROUTES.home, "/telegram/app");
  assert.equal(TELEGRAM_MINI_APP_ROUTES.find, "/telegram/app/find");
  assert.equal(TELEGRAM_MINI_APP_ROUTES.upload, "/telegram/app/upload");
  assert.equal(TELEGRAM_MINI_APP_ROUTES.profile, "/telegram/app/profile");
});

test("isTelegramMiniAppRootPath only matches home route", () => {
  assert.equal(isTelegramMiniAppRootPath("/telegram/app"), true);
  assert.equal(isTelegramMiniAppRootPath("/telegram/app/"), true);
  assert.equal(isTelegramMiniAppRootPath("/telegram/app/find"), false);
});

test("resolveTelegramMiniAppScreenPath maps screen query param", () => {
  const params = new URLSearchParams("screen=find");
  assert.equal(
    resolveTelegramMiniAppScreenPath("/telegram/app", params),
    TELEGRAM_MINI_APP_ROUTES.find,
  );
  assert.equal(
    resolveTelegramMiniAppScreenPath("/telegram/app", new URLSearchParams("screen=home")),
    TELEGRAM_MINI_APP_ROUTES.home,
  );
  assert.equal(
    resolveTelegramMiniAppScreenPath("/telegram/app", new URLSearchParams("screen=unknown")),
    null,
  );
});

test("Telegram Home API returns shared Home data", () => {
  const homeRoute = readFileSync(
    resolve(import.meta.dirname, "../app/api/telegram/mini-app/home/route.ts"),
    "utf8",
  );
  const homeData = readFileSync(
    resolve(import.meta.dirname, "../lib/home-data.ts"),
    "utf8",
  );
  const home = readFileSync(
    resolve(import.meta.dirname, "../components/telegram/TelegramMiniAppHome.tsx"),
    "utf8",
  );

  assert.match(homeRoute, /getHomeDataForUser/);
  assert.match(homeData, /getAutomaticHeroCarousel/);
  assert.match(homeData, /listFriendsForUser/);
  assert.match(homeData, /loadRecentSnapsForHome/);
  assert.match(home, /HomeContent/);
  assert.doesNotMatch(homeRoute, /getPaginatedSnapsForMiniApp/);
});

test("Telegram Home uses the same content components as Web Home", () => {
  const shared = readFileSync(
    resolve(import.meta.dirname, "../components/home/HomeContent.tsx"),
    "utf8",
  );
  const web = readFileSync(
    resolve(import.meta.dirname, "../app/home/page.tsx"),
    "utf8",
  );
  const telegram = readFileSync(
    resolve(import.meta.dirname, "../components/telegram/TelegramMiniAppHome.tsx"),
    "utf8",
  );

  assert.match(web, /HomeContent/);
  assert.match(shared, /HeroCarousel/);
  assert.match(shared, /RecentSnaps/);
  assert.match(shared, /FriendCard/);
  assert.match(shared, /Snap/);
  assert.match(telegram, /HomeContent/);
  assert.doesNotMatch(telegram, /TelegramSnapFeed/);
  assert.doesNotMatch(telegram, /nextCursor/);
});

test("Telegram Home has no duplicate Snap feed or pagination implementation", () => {
  const telegramHome = readFileSync(
    resolve(import.meta.dirname, "../components/telegram/TelegramMiniAppHome.tsx"),
    "utf8",
  );
  const telegramFeedPath = resolve(
    import.meta.dirname,
    "../components/telegram/TelegramSnapFeed.tsx",
  );

  assert.doesNotMatch(telegramHome, /IntersectionObserver/);
  assert.doesNotMatch(telegramHome, /Load more/);
  assert.equal(existsSync(telegramFeedPath), false);
});

test("bottom nav uses safe-area inset on shell", () => {
  const nav = readFileSync(
    resolve(import.meta.dirname, "../components/telegram/TelegramBottomNav.tsx"),
    "utf8",
  );
  const shell = readFileSync(
    resolve(import.meta.dirname, "../components/telegram/TelegramMiniAppShell.tsx"),
    "utf8",
  );
  assert.match(nav, /safe-area-inset-bottom/);
  assert.match(shell, /safe-area-inset/);
});

test("back button hook supports enabled callback navigation", () => {
  const hook = readFileSync(
    resolve(import.meta.dirname, "../hooks/useTelegramBackButton.ts"),
    "utf8",
  );
  assert.match(hook, /onBack/);
  assert.match(hook, /BackButton\.show/);
  assert.match(hook, /BackButton\.hide/);
});

test("PWA install prompt skips telegram mini app paths", () => {
  const install = readFileSync(
    resolve(import.meta.dirname, "../components/pwa/InstallPrompt.tsx"),
    "utf8",
  );
  assert.match(install, /isTelegramMiniAppPath/);
});

test("auth provider keeps initData session bridge for linked users", () => {
  const auth = readFileSync(
    resolve(
      import.meta.dirname,
      "../components/telegram/TelegramMiniAppAuthProvider.tsx",
    ),
    "utf8",
  );
  assert.match(auth, /\/api\/telegram\/mini-app\/session/);
  assert.match(auth, /status: "unlinked"/);
  assert.match(auth, /status: "linked"/);
});
