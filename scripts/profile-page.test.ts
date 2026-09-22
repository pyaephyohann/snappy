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

test("gallery choice in snap picker only navigates to payment", () => {
  const picker = read("components/profile/ProfileSnapPicker.tsx");
  assert.match(picker, /Upload from Gallery/i);
  assert.match(picker, /\/profile\/payment\?feature=profile-photo/);
  // Zero gallery interaction before payment: no file input, no upload call.
  assert.doesNotMatch(picker, /type="file"/);
  assert.doesNotMatch(picker, /inputRef/);
  assert.doesNotMatch(picker, /uploadImageFileToCloudinary/);
  assert.doesNotMatch(picker, /\/api\/profile\/profile-photo\/gallery/);
});

test("profile photo gallery unlock is enforced server-side", () => {
  const galleryRoute = read("app/api/profile/profile-photo/gallery/route.ts");
  assert.match(galleryRoute, /getProfilePhotoGalleryUnlockState/);
  assert.match(galleryRoute, /402/);
  const paymentRoute = read("app/api/profile/profile-photo/payment/route.ts");
  assert.match(paymentRoute, /completeProfilePhotoGalleryPayment/);
});

test("change profile photo opens snap picker, not payment", () => {
  const ui = read("components/profile/ProfilePageClient.tsx");
  // Change Profile Photo always opens the Snap picker — never payment.
  assert.match(ui, /onClick=\{\(\) => setPickerOpen\(true\)\}/);
  assert.doesNotMatch(ui, /\/profile\/payment\?feature=profile-photo/);
  // Upload from Gallery (inside the picker) is the only payment entry point.
  const picker = read("components/profile/ProfileSnapPicker.tsx");
  assert.match(picker, /\/profile\/payment\?feature=profile-photo/);
  // Pay button on the payment page is presentational for this flow.
  const payment = read("components/payment/PremiumFeaturePaymentClient.tsx");
  assert.doesNotMatch(payment, /\/api\/profile\/profile-photo\/payment/);
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

test("profile uploads loader scopes snaps to the uploader", () => {
  const loader = read("lib/profile-snaps.ts");
  assert.match(loader, /where: \{ uploadedById: userId \}/);
  assert.match(loader, /orderBy: \{ createdAt: "desc" \}/);
});

test("profile page lists the session user's uploaded snaps", () => {
  const page = read("app/profile/page.tsx");
  assert.match(page, /listUploadedSnapsForUser/);
  assert.match(page, /uploadedSnaps/);
});

test("caption API authenticates and enforces uploader ownership", () => {
  const route = read("app/api/snaps/[snapId]/caption/route.ts");
  assert.match(route, /getAuthenticatedAppUser/);
  assert.match(route, /Unauthorized/);
  assert.match(route, /status: 401/);
  const captionService = read("lib/snap-caption-service.ts");
  assert.match(captionService, /snap\.uploadedById !== input\.userId/);
  assert.match(route, /status: 403/);
  // Caption-only update: the zod schema accepts caption alone, and the update
  // payload writes no media or ownership fields.
  assert.match(route, /const updateSnapCaptionSchema = z\.object\(\{/);
  assert.match(route, /\.max\(/);
  assert.match(route, /SNAP_MAX_CAPTION_LENGTH/);
  assert.match(captionService, /data: \{ caption: input\.caption \}/);
  assert.doesNotMatch(
    captionService,
    /data: \{[\s\S]{0,100}(imageUrl|publicId|userId|uploadedById):/,
  );
});

test("profile snap gallery enables caption editing only for own uploads", () => {
  const ui = read("components/profile/ProfilePageClient.tsx");
  assert.match(ui, /SnapGallery/);
  assert.match(ui, /canEditCaptions/);
  const gallery = read("components/friends/SnapGallery.tsx");
  assert.match(gallery, /canEditCaptions = false/);
  assert.match(gallery, /canEditCaption=\{canEditCaptions\}/);
  const viewer = read("components/snaps/SnapViewer.tsx");
  assert.match(viewer, /canEditCaption = false/);
  assert.match(viewer, /\/api\/snaps\/\$\{snapId\}\/caption/);
  assert.match(viewer, /method: 'PATCH'/);
  // Friend profiles must never offer caption editing.
  const friend = read("components/friends/FriendProfileClient.tsx");
  assert.doesNotMatch(friend, /canEditCaption/);
});

test("payment page lists KPay AYA Pay UAB Pay and syncs carousel", () => {
  const payment = read("lib/premium-profile-photo-payment.ts");
  assert.match(payment, /KPay/);
  assert.match(payment, /AYA Pay/);
  assert.match(payment, /UAB Pay/);
  const client = read("components/payment/PremiumFeaturePaymentClient.tsx");
  assert.match(client, /HeroCarousel/);
  assert.match(client, /selectedPaymentMethod/);
  assert.match(client, /activeSlideIndex/);
  assert.match(client, /Change your profile picture/);
});
