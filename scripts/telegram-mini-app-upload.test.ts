/**
 * Telegram Mini App native upload (T4.4).
 * Run: npm run test:telegram-mini-app-upload
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  SNAP_MAX_IMAGE_BYTES,
  validateSnapImageFileMeta,
} from "../lib/snap-media";

test("validateSnapImageFileMeta accepts supported image types", () => {
  for (const type of [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
  ] as const) {
    const result = validateSnapImageFileMeta({ size: 1024, type });
    assert.equal(result.ok, true);
  }
});

test("validateSnapImageFileMeta rejects oversize and unsupported files", () => {
  assert.equal(
    validateSnapImageFileMeta({
      size: SNAP_MAX_IMAGE_BYTES + 1,
      type: "image/jpeg",
    }).ok,
    false,
  );
  assert.equal(
    validateSnapImageFileMeta({ size: 0, type: "image/jpeg" }).ok,
    false,
  );
  assert.equal(
    validateSnapImageFileMeta({ size: 100, type: "application/pdf" }).ok,
    false,
  );
});

test("mini app snap API derives owner from session only", () => {
  const route = readFileSync(
    resolve(import.meta.dirname, "../app/api/telegram/mini-app/snaps/route.ts"),
    "utf8",
  );
  assert.match(route, /getAuthenticatedAppUser/);
  assert.match(route, /createSnapWithSparkAccounting/);
  assert.match(route, /targetUserId: user\.id/);
  assert.match(route, /idempotencyKey/);
  assert.doesNotMatch(route, /targetUserId.*request/);
  assert.doesNotMatch(route, /telegramUserId/);
});

test("upload client uses shared Cloudinary sign and mini app create endpoint", () => {
  const client = readFileSync(
    resolve(import.meta.dirname, "../lib/snap-upload-client.ts"),
    "utf8",
  );
  assert.match(client, /\/api\/cloudinary\/sign/);
  assert.match(client, /uploadSnapForMiniApp/);
  assert.match(client, /\/api\/telegram\/mini-app\/snaps/);
  assert.match(client, /uploadSnapForUser/);
});

test("TelegramMiniAppUpload delegates to the shared web camera/upload flow", () => {
  const ui = readFileSync(
    resolve(
      import.meta.dirname,
      "../components/telegram/TelegramMiniAppUpload.tsx",
    ),
    "utf8",
  );
  const sharedFlow = readFileSync(
    resolve(import.meta.dirname, "../components/mobile/BottomNavCameraFlow.tsx"),
    "utf8",
  );
  assert.match(ui, /BottomNavCameraFlow/);
  assert.match(sharedFlow, /FriendsPickerPanel/);
  assert.match(sharedFlow, /SnapCameraCapture/);
  assert.match(sharedFlow, /SnapCreateComposerModal/);
  assert.match(sharedFlow, /uploadSnapForUser/);
});

test("shell delegates BackButton on upload route to upload screen", () => {
  const shell = readFileSync(
    resolve(
      import.meta.dirname,
      "../components/telegram/TelegramMiniAppShell.tsx",
    ),
    "utf8",
  );
  assert.match(shell, /isUploadRoute/);
});
