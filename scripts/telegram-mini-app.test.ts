/**
 * Telegram Mini App initData validation and helpers.
 * Run: npm run test:telegram-mini-app
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInitDataCheckString,
  computeInitDataHash,
  DEFAULT_TELEGRAM_INIT_DATA_MAX_AGE_SECONDS,
  validateTelegramInitData,
} from "../lib/telegram/init-data";
import { buildTelegramMiniAppUrl } from "../lib/telegram/mini-app-url";
import { buildMainKeyboard } from "../lib/telegram/keyboards";

const TEST_BOT_TOKEN = "123456789:AAH-dummy-token-for-unit-tests-only";

function buildSignedInitData(
  fields: Record<string, string>,
  botToken: string = TEST_BOT_TOKEN,
): string {
  const params = new URLSearchParams(fields);
  const checkString = buildInitDataCheckString(params);
  const hash = computeInitDataHash(checkString, botToken);
  params.set("hash", hash);
  return params.toString();
}

const sampleUser = JSON.stringify({
  id: 42424242,
  first_name: "Test",
  username: "testuser",
});

test("validateTelegramInitData accepts a correctly signed payload", () => {
  const now = 1_700_000_000;
  const initData = buildSignedInitData({
    auth_date: String(now),
    user: sampleUser,
  });

  const result = validateTelegramInitData(initData, TEST_BOT_TOKEN, {
    nowSeconds: now,
    maxAgeSeconds: DEFAULT_TELEGRAM_INIT_DATA_MAX_AGE_SECONDS,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.user.telegramUserId, "42424242");
    assert.equal(result.user.username, "testuser");
    assert.equal(result.user.authDate, now);
  }
});

test("validateTelegramInitData rejects invalid signature", () => {
  const initData = buildSignedInitData({
    auth_date: String(1_700_000_000),
    user: sampleUser,
  });
  const result = validateTelegramInitData(initData, "wrong:token");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "invalid_signature");
  }
});

test("validateTelegramInitData rejects tampered user id", () => {
  const now = 1_700_000_000;
  const initData = buildSignedInitData({
    auth_date: String(now),
    user: sampleUser,
  });
  const tampered = initData.replace("42424242", "99999999");
  const result = validateTelegramInitData(tampered, TEST_BOT_TOKEN, {
    nowSeconds: now,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "invalid_signature");
  }
});

test("validateTelegramInitData rejects expired auth_date", () => {
  const now = 1_700_000_000;
  const old = now - DEFAULT_TELEGRAM_INIT_DATA_MAX_AGE_SECONDS - 1;
  const initData = buildSignedInitData({
    auth_date: String(old),
    user: sampleUser,
  });
  const result = validateTelegramInitData(initData, TEST_BOT_TOKEN, {
    nowSeconds: now,
    maxAgeSeconds: DEFAULT_TELEGRAM_INIT_DATA_MAX_AGE_SECONDS,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "expired");
  }
});

test("validateTelegramInitData rejects malformed and missing user", () => {
  assert.equal(validateTelegramInitData("", TEST_BOT_TOKEN).ok, false);
  assert.equal(
    validateTelegramInitData("not=valid&hash=abc", TEST_BOT_TOKEN).ok,
    false,
  );

  const noUser = buildSignedInitData({ auth_date: "1700000000" });
  const missingUser = validateTelegramInitData(noUser, TEST_BOT_TOKEN, {
    nowSeconds: 1_700_000_000,
  });
  assert.equal(missingUser.ok, false);
  if (!missingUser.ok) {
    assert.equal(missingUser.reason, "missing_user");
  }

  const badUser = buildSignedInitData({
    auth_date: "1700000000",
    user: "{not-json",
  });
  const badUserResult = validateTelegramInitData(badUser, TEST_BOT_TOKEN, {
    nowSeconds: 1_700_000_000,
  });
  assert.equal(badUserResult.ok, false);
});

test("Telegram identity uses numeric user id regardless of username", () => {
  const now = 1_700_000_000;
  const renamedUser = JSON.stringify({
    id: 42424242,
    first_name: "Test",
    username: "new_handle",
  });
  const initData = buildSignedInitData({
    auth_date: String(now),
    user: renamedUser,
  });
  const result = validateTelegramInitData(initData, TEST_BOT_TOKEN, {
    nowSeconds: now,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.user.telegramUserId, "42424242");
    assert.equal(result.user.username, "new_handle");
  }
});

test("mini app auth bridge reuses existing Snappy session helper", () => {
  const src = readFileSync(
    resolve(import.meta.dirname, "../lib/telegram/mini-app-auth.ts"),
    "utf8",
  );
  assert.match(src, /from "@\/lib\/auth"/);
  assert.match(src, /createSession\(/);
  assert.match(src, /getLinkedAccountByTelegramUserId/);
  assert.match(src, /createTelegramLinkChallenge/);
});

test("buildTelegramMiniAppUrl uses SNAPPY_PUBLIC_URL", () => {
  const previous = process.env.SNAPPY_PUBLIC_URL;
  process.env.SNAPPY_PUBLIC_URL = "https://snappy.example/";
  try {
    assert.equal(
      buildTelegramMiniAppUrl(),
      "https://snappy.example/telegram/app",
    );
  } finally {
    if (previous === undefined) {
      delete process.env.SNAPPY_PUBLIC_URL;
    } else {
      process.env.SNAPPY_PUBLIC_URL = previous;
    }
  }
});

test("buildMainKeyboard includes Mini App web_app button when URL is configured", () => {
  const previous = process.env.SNAPPY_PUBLIC_URL;
  process.env.SNAPPY_PUBLIC_URL = "https://snappy.example";
  try {
    const keyboard = buildMainKeyboard();
    const rows = keyboard.inline_keyboard;
    const webAppButton = rows.flat().find((button) => "web_app" in button);
    assert.ok(webAppButton && "web_app" in webAppButton);
    if (webAppButton && "web_app" in webAppButton) {
      assert.match(webAppButton.web_app.url, /\/telegram\/app$/);
    }
  } finally {
    if (previous === undefined) {
      delete process.env.SNAPPY_PUBLIC_URL;
    } else {
      process.env.SNAPPY_PUBLIC_URL = previous;
    }
  }
});
