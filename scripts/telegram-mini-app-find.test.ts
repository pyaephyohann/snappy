/**
 * Telegram Mini App native Find (T4.3).
 * Run: npm run test:telegram-mini-app-find
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { mapSnapLookupToMiniAppFindResponse } from "../lib/telegram/mini-app-find";

test("mapSnapLookupToMiniAppFindResponse returns safe found payload", () => {
  const mapped = mapSnapLookupToMiniAppFindResponse({
    status: "found",
    snap: {
      code: "clxyz1234567890abcdefghij",
      caption: "Hello",
      imageUrl: "https://res.cloudinary.com/demo/image/upload/v1/x.jpg",
      createdAt: new Date("2026-01-15T12:00:00.000Z"),
      creatorName: "Alice",
      viewPath: "/friends/Alice",
    },
  });
  assert.equal(mapped.found, true);
  if (mapped.found) {
    assert.equal(mapped.snap.id, "clxyz1234567890abcdefghij");
    assert.equal(mapped.snap.username, "Alice");
    assert.equal(mapped.snap.imageUrl.includes("res.cloudinary.com"), true);
    assert.equal(mapped.snap.createdAt, "2026-01-15T12:00:00.000Z");
  }
});

test("mapSnapLookupToMiniAppFindResponse hides not found and invalid input", () => {
  assert.deepEqual(
    mapSnapLookupToMiniAppFindResponse({ status: "not_found" }),
    { found: false },
  );
  assert.deepEqual(
    mapSnapLookupToMiniAppFindResponse({
      status: "invalid_input",
      reason: "invalid_format",
    }),
    { found: false, invalidCode: true },
  );
});

test("mini app find API uses session auth and shared lookupSnapByCode", () => {
  const route = readFileSync(
    resolve(import.meta.dirname, "../app/api/telegram/mini-app/find/route.ts"),
    "utf8",
  );
  assert.match(route, /getSession\(/);
  assert.match(route, /lookupSnapByCode/);
  assert.match(route, /mapSnapLookupToMiniAppFindResponse/);
  assert.doesNotMatch(route, /telegramUserId/);
  assert.doesNotMatch(route, /initData/);
});

test("TelegramMiniAppFind reuses SnapViewer and code normalization", () => {
  const ui = readFileSync(
    resolve(
      import.meta.dirname,
      "../components/telegram/TelegramMiniAppFind.tsx",
    ),
    "utf8",
  );
  assert.match(ui, /normalizeSnapLookupCode/);
  assert.match(ui, /SnapViewer/);
  assert.match(ui, /Find Another/);
  assert.match(ui, /\/api\/telegram\/mini-app\/find/);
});

test("find route owns Telegram BackButton; shell skips find path", () => {
  const shell = readFileSync(
    resolve(
      import.meta.dirname,
      "../components/telegram/TelegramMiniAppShell.tsx",
    ),
    "utf8",
  );
  const findUi = readFileSync(
    resolve(
      import.meta.dirname,
      "../components/telegram/TelegramMiniAppFind.tsx",
    ),
    "utf8",
  );
  assert.match(shell, /isFindRoute/);
  assert.match(findUi, /useTelegramBackButton/);
  assert.match(findUi, /TELEGRAM_MINI_APP_ROUTES\.home/);
  assert.match(findUi, /TELEGRAM_MINI_APP_ROUTES\.find/);
});

test("shell screen=find deep link remains supported", () => {
  const deepLink = readFileSync(
    resolve(import.meta.dirname, "../lib/telegram/mini-app-deep-link.ts"),
    "utf8",
  );
  assert.match(deepLink, /TELEGRAM_MINI_APP_QUERY\.screen/);
  assert.match(deepLink, /find/);
});
