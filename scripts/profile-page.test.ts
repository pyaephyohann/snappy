/**
 * Profile page APIs and security checks.
 * Run: node --import tsx --test scripts/profile-page.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

test("profile API requires authenticated app user", () => {
  const route = read("app/api/profile/route.ts");
  assert.match(route, /getAuthenticatedAppUser/);
  assert.match(route, /Unauthorized/);
});

test("profile photo API scopes snaps to session user", () => {
  const route = read("app/api/profile/profile-photo/route.ts");
  assert.match(route, /where: \{ userId: user\.id \}/);
  assert.match(route, /setUserProfilePhotoFromSnap/);
});

test("profile photo service enforces snap ownership", () => {
  const service = read("lib/profile-photo-service.ts");
  assert.match(service, /snap\.userId !== userId/);
  assert.match(service, /status: 403/);
});

test("desktop navbar includes Profile link and inline friend search", () => {
  const navbar = read("components/layout/Navbar.tsx");
  assert.match(navbar, /href: "\/profile"/);
  assert.match(navbar, /NavbarDesktopFriendSearch/);
  assert.doesNotMatch(navbar, /href: "\/search"/);
  const search = read("components/layout/NavbarDesktopFriendSearch.tsx");
  assert.match(search, /\/api\/users\/list/);
  assert.match(search, /Search friends/);
});

test("profile page has no standalone premium upload section", () => {
  const ui = read("components/profile/ProfilePageClient.tsx");
  assert.doesNotMatch(ui, /Upload a new photo/);
  assert.doesNotMatch(ui, /Premium/);
  assert.doesNotMatch(ui, /type=\"file\"/);
});

test("upload from gallery lives in snap picker and links to payment", () => {
  const picker = read("components/profile/ProfileSnapPicker.tsx");
  assert.match(picker, /Upload From Gallery/);
  assert.match(picker, /\/profile\/payment\?feature=profile-photo/);
});

test("telegram connect button is shared on profile and connect page", () => {
  const connect = read("components/telegram/TelegramConnectButton.tsx");
  assert.match(connect, /Connect Telegram/);
  assert.match(connect, /TELEGRAM_CONNECT_BUTTON_CLASSNAME/);
  assert.match(connect, /\/api\/telegram\/link/);
  assert.match(connect, /\/api\/telegram\/mini-app\/meta/);
  assert.doesNotMatch(connect, /token=[a-f0-9]{20,}/i);
  const page = read("app/telegram/connect/page.tsx");
  assert.match(page, /TelegramConnectButton linkToken=\{token\}/);
  const profile = read("components/profile/ProfilePageClient.tsx");
  assert.match(profile, /TelegramConnectButton/);
});

test("payment page lists KPay AYA Pay UAB Pay", () => {
  const payment = read("lib/premium-profile-photo-payment.ts");
  assert.match(payment, /KPay/);
  assert.match(payment, /AYA Pay/);
  assert.match(payment, /UAB Pay/);
  const client = read("components/payment/PremiumFeaturePaymentClient.tsx");
  assert.match(client, /HeroCarousel/);
});
