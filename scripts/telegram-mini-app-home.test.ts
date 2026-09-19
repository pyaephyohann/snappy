/**
 * Telegram Mini App home + navigation (Node test runner).
 * Run: npm run test:telegram-mini-app-home
 */
import { readFileSync } from "node:fs";
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

test("home API reuses shared loadRecentSnapsForHome", () => {
  const homeRoute = readFileSync(
    resolve(import.meta.dirname, "../app/api/telegram/mini-app/home/route.ts"),
    "utf8",
  );
  const recentSnapsLib = readFileSync(
    resolve(import.meta.dirname, "../lib/recent-snaps.ts"),
    "utf8",
  );
  const section = readFileSync(
    resolve(import.meta.dirname, "../components/home/RecentSnapsSection.tsx"),
    "utf8",
  );

  assert.match(homeRoute, /loadRecentSnapsForHome/);
  assert.match(recentSnapsLib, /export async function loadRecentSnapsForHome/);
  assert.match(section, /loadRecentSnapsForHome/);
  assert.doesNotMatch(section, /getRecentSnaps\(/);
});

test("Telegram home uses a vertical feed with manual cursor pagination", () => {
  const home = readFileSync(
    resolve(import.meta.dirname, "../components/telegram/TelegramMiniAppHome.tsx"),
    "utf8",
  );
  const feed = readFileSync(
    resolve(import.meta.dirname, "../components/telegram/TelegramSnapFeed.tsx"),
    "utf8",
  );

  assert.match(home, /TelegramSnapFeed/);
  assert.match(home, /nextCursor/);
  assert.match(home, /onLoadMore/);
  assert.match(feed, /Load more/);
  assert.match(feed, /loadingMore/);
  assert.match(feed, /No more Snaps/);
  assert.match(feed, /Could not load more Snaps/);
  assert.match(feed, /flex-col/);
  assert.match(feed, /SnapCard/);
  assert.doesNotMatch(feed, /IntersectionObserver/);
  assert.doesNotMatch(feed, /overflow-x-auto/);
  assert.doesNotMatch(feed, /snap-x/);
});

test("Telegram pagination appends pages without navigation or reload", () => {
  const home = readFileSync(
    resolve(import.meta.dirname, "../components/telegram/TelegramMiniAppHome.tsx"),
    "utf8",
  );
  const feed = readFileSync(
    resolve(import.meta.dirname, "../components/telegram/TelegramSnapFeed.tsx"),
    "utf8",
  );
  const homeRoute = readFileSync(
    resolve(import.meta.dirname, "../app/api/telegram/mini-app/home/route.ts"),
    "utf8",
  );

  assert.match(home, /loadHome\(state\.nextCursor\)/);
  assert.match(home, /snaps: \[\.\.\.current\.snaps, \.\.\.body\.snaps\]/);
  assert.match(home, /nextCursor: body\.nextCursor/);
  assert.match(feed, /disabled=\{loadingMore\}/);
  assert.match(feed, /handleLoadMore/);
  assert.doesNotMatch(home, /window\.location\.reload/);
  assert.doesNotMatch(home, /router\.refresh/);
  assert.doesNotMatch(feed, /window\.location\.reload/);
  assert.doesNotMatch(feed, /href=/);
  assert.match(homeRoute, /getPaginatedSnapsForMiniApp\(\{ cursor \}\)/);
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
