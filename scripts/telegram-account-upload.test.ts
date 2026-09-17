/**
 * Telegram account linking + upload helpers (Node test runner).
 * Run: npm run test:telegram-upload
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  generateTelegramLinkToken,
  hashTelegramLinkToken,
  isLinkChallengeExpired,
  isLinkTokenFormatValid,
  TELEGRAM_LINK_TTL_MS,
} from "../lib/telegram/link-token";
import {
  TELEGRAM_AWAITING_FIND,
  TELEGRAM_AWAITING_UPLOAD,
  TELEGRAM_CHAT_STATE_TTL_MS,
} from "../lib/telegram/chat-state-constants";
import {
  SNAP_MAX_IMAGE_BYTES,
  validateSnapImageBuffer,
} from "../lib/snap-media";
import {
  TELEGRAM_UPLOAD_MAX_PER_HOUR,
  TELEGRAM_UPLOAD_WINDOW_MS,
} from "../lib/telegram/upload-rate-limit-constants";
import { buildTelegramConnectUrl } from "../lib/telegram/connect-url";
import {
  validateCloudinarySnapPublicId,
  validateCloudinarySnapUrl,
} from "../lib/snap-validation";

test("link token format and hash are stable", () => {
  const { token, tokenHash } = generateTelegramLinkToken();
  assert.equal(isLinkTokenFormatValid(token), true);
  assert.equal(hashTelegramLinkToken(token), tokenHash);
  assert.equal(isLinkTokenFormatValid("short"), false);
});

test("link token cannot be replayed with wrong hash", () => {
  const { token } = generateTelegramLinkToken();
  const other = generateTelegramLinkToken().tokenHash;
  assert.notEqual(hashTelegramLinkToken(token), other);
});

test("link challenge expiry respects TTL window", () => {
  const expiresAt = new Date(Date.now() + TELEGRAM_LINK_TTL_MS);
  assert.equal(isLinkChallengeExpired(expiresAt), false);
  assert.equal(
    isLinkChallengeExpired(new Date(Date.now() - 1000)),
    true,
  );
});

test("chat modes distinguish find vs upload", () => {
  assert.notEqual(TELEGRAM_AWAITING_FIND, TELEGRAM_AWAITING_UPLOAD);
  assert.equal(TELEGRAM_CHAT_STATE_TTL_MS, 15 * 60 * 1000);
});

test("validateSnapImageBuffer accepts jpeg magic bytes", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const result = validateSnapImageBuffer(jpeg, "image/jpeg");
  assert.equal(result.ok, true);
});

test("validateSnapImageBuffer rejects oversize buffers", () => {
  const big = Buffer.alloc(SNAP_MAX_IMAGE_BYTES + 1);
  big[0] = 0xff;
  big[1] = 0xd8;
  big[2] = 0xff;
  const result = validateSnapImageBuffer(big);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "too_large");
  }
});

test("validateSnapImageBuffer rejects non-image bytes", () => {
  const result = validateSnapImageBuffer(Buffer.from("hello"));
  assert.equal(result.ok, false);
});

test("telegram upload rate limit constants are conservative", () => {
  assert.equal(TELEGRAM_UPLOAD_MAX_PER_HOUR, 10);
  assert.equal(TELEGRAM_UPLOAD_WINDOW_MS, 60 * 60 * 1000);
});

test("buildTelegramConnectUrl uses configured origin only", () => {
  const previous = process.env.SNAPPY_PUBLIC_URL;
  process.env.SNAPPY_PUBLIC_URL = "https://snappy.example";
  try {
    const url = buildTelegramConnectUrl("testtoken123456789012345678901234567890");
    assert.match(url ?? "", /^https:\/\/snappy\.example\/telegram\/connect\?token=/);
  } finally {
    if (previous === undefined) {
      delete process.env.SNAPPY_PUBLIC_URL;
    } else {
      process.env.SNAPPY_PUBLIC_URL = previous;
    }
  }
  assert.equal(buildTelegramConnectUrl("x".repeat(40)), null);
});

test("snap validation accepts cloudinary snap assets", () => {
  assert.equal(
    validateCloudinarySnapUrl(
      "https://res.cloudinary.com/demo/image/upload/v1/snappy/snaps/a.jpg",
    ),
    true,
  );
  assert.equal(
    validateCloudinarySnapPublicId("snappy/snaps/abc123"),
    true,
  );
});
