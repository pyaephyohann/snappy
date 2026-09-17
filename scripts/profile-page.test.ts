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

test("profile UI links premium upload to payment page", () => {
  const ui = read("components/profile/ProfilePageClient.tsx");
  assert.match(ui, /\/profile\/payment\?feature=profile-photo/);
  assert.doesNotMatch(ui, /type=\"file\"/);
});

test("payment page lists KPay AYA Pay UAB Pay", () => {
  const payment = read("lib/premium-profile-photo-payment.ts");
  assert.match(payment, /KPay/);
  assert.match(payment, /AYA Pay/);
  assert.match(payment, /UAB Pay/);
  const client = read("components/payment/PremiumFeaturePaymentClient.tsx");
  assert.match(client, /HeroCarousel/);
});
