/**
 * Telegram Mini App profile & account (T4.5).
 * Run: npm run test:telegram-mini-app-profile
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

test("profile API loads data from authenticated session helper", () => {
  const route = readFileSync(
    resolve(
      import.meta.dirname,
      "../app/api/telegram/mini-app/profile/route.ts",
    ),
    "utf8",
  );
  const loader = readFileSync(
    resolve(import.meta.dirname, "../lib/telegram/mini-app-profile.ts"),
    "utf8",
  );
  assert.match(route, /loadMiniAppProfileForSession/);
  assert.match(loader, /getAuthenticatedAppUser/);
  assert.match(loader, /getLinkedAccountByUserId/);
  assert.doesNotMatch(route, /searchParams\.get\("user/);
});

test("mini app link reuses T3 completeTelegramLink with verified initData", () => {
  const link = readFileSync(
    resolve(
      import.meta.dirname,
      "../lib/telegram/mini-app-link-from-init.ts",
    ),
    "utf8",
  );
  const route = readFileSync(
    resolve(
      import.meta.dirname,
      "../app/api/telegram/mini-app/link/route.ts",
    ),
    "utf8",
  );
  assert.match(link, /validateTelegramInitData/);
  assert.match(link, /createTelegramLinkChallenge/);
  assert.match(link, /completeTelegramLink/);
  assert.match(route, /linkAuthenticatedUserFromInitData/);
});

test("profile UI reuses the complete web profile client", () => {
  const ui = readFileSync(
    resolve(
      import.meta.dirname,
      "../components/telegram/TelegramMiniAppProfile.tsx",
    ),
    "utf8",
  );
  const sharedProfile = readFileSync(
    resolve(import.meta.dirname, "../components/profile/ProfilePageClient.tsx"),
    "utf8",
  );
  assert.match(ui, /ProfilePageClient/);
  assert.match(ui, /uploadedSnaps/);
  assert.match(ui, /homeHref/);
  assert.match(sharedProfile, /TelegramDisconnectButton/);
  assert.match(sharedProfile, /ProfileSnapPicker/);
});

test("shell skips BackButton on profile route", () => {
  const shell = readFileSync(
    resolve(
      import.meta.dirname,
      "../components/telegram/TelegramMiniAppShell.tsx",
    ),
    "utf8",
  );
  assert.match(shell, /isProfileRoute/);
});

test("unlink API binds to authenticated app user only", () => {
  const unlink = readFileSync(
    resolve(import.meta.dirname, "../app/api/telegram/unlink/route.ts"),
    "utf8",
  );
  assert.match(unlink, /requireAuthenticatedAppUser/);
  assert.match(unlink, /unlinkTelegramAccountForUser\(user\.id\)/);
});
