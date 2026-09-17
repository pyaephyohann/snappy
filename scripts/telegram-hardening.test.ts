/**
 * Telegram production hardening (T6).
 * Run: npm run test:telegram-hardening
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInitDataCheckString,
  computeInitDataHash,
  validateTelegramInitData,
} from "../lib/telegram/init-data";
import {
  normalizeTelegramMiniAppStartParam,
  resolveTelegramMiniAppDeepLinkTarget,
} from "../lib/telegram/mini-app-deep-link";
import { TELEGRAM_MINI_APP_INIT_DATA_MAX_BYTES } from "../lib/telegram/mini-app-request-limits";
import {
  isTelegramUpdatePayload,
  TELEGRAM_WEBHOOK_MAX_UPDATE_BYTES,
  verifyTelegramWebhookSecret,
} from "../lib/telegram/webhook-security";
import {
  isLinkChallengeExpired,
  isLinkTokenFormatValid,
  TELEGRAM_LINK_TTL_MS,
} from "../lib/telegram/link-token";
import { TELEGRAM_CHAT_STATE_TTL_MS } from "../lib/telegram/chat-state-constants";
import { registerTelegramBotErrorHandler } from "../lib/telegram/bot-error-handler";

const TEST_BOT_TOKEN = "123456789:AAH-dummy-token-for-unit-tests-only";
const SAMPLE_CODE = "clxyz1234567890abcdefghij";

function buildSignedInitData(fields: Record<string, string>): string {
  const params = new URLSearchParams(fields);
  const checkString = buildInitDataCheckString(params);
  const hash = computeInitDataHash(checkString, TEST_BOT_TOKEN);
  params.set("hash", hash);
  return params.toString();
}

test("invalid webhook secret is rejected", () => {
  assert.equal(verifyTelegramWebhookSecret("wrong", "expected-secret"), false);
  assert.equal(verifyTelegramWebhookSecret("", "expected-secret"), false);
  assert.equal(verifyTelegramWebhookSecret("expected-secret", null), false);
});

test("malformed webhook payload is not treated as Telegram update", () => {
  assert.equal(isTelegramUpdatePayload(null), false);
  assert.equal(isTelegramUpdatePayload({}), false);
  assert.equal(isTelegramUpdatePayload({ update_id: 1.5 }), false);
  assert.equal(isTelegramUpdatePayload({ update_id: 42 }), true);
});

test("webhook max payload size is bounded", () => {
  assert.equal(TELEGRAM_WEBHOOK_MAX_UPDATE_BYTES, 256 * 1024);
});

test("expired Mini App initData is rejected", () => {
  const now = 1_700_000_000;
  const initData = buildSignedInitData({
    auth_date: String(now - 7200),
    user: JSON.stringify({ id: 1, first_name: "A" }),
  });
  const result = validateTelegramInitData(initData, TEST_BOT_TOKEN, {
    nowSeconds: now,
    maxAgeSeconds: 3600,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "expired");
  }
});

test("tampered Mini App initData is rejected", () => {
  const user = JSON.stringify({ id: 42424242, first_name: "A" });
  const initData = buildSignedInitData({
    auth_date: String(1_700_000_000),
    user,
  });
  const tampered = initData.replace("42424242", "99999999");
  const result = validateTelegramInitData(tampered, TEST_BOT_TOKEN, {
    nowSeconds: 1_700_000_000,
  });
  assert.equal(result.ok, false);
});

test("oversized initData is rejected before HMAC validation", () => {
  const huge = "a".repeat(TELEGRAM_MINI_APP_INIT_DATA_MAX_BYTES + 1);
  const result = validateTelegramInitData(huge, TEST_BOT_TOKEN);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "malformed");
  }
});

test("invalid deep link screen falls back to home route", () => {
  const params = new URLSearchParams({ screen: "not-a-screen" });
  const target = resolveTelegramMiniAppDeepLinkTarget(
    "/telegram/app/find",
    params,
    null,
  );
  assert.equal(target, "/telegram/app");
});

test("conflicting deep-link parameters prefer URL query over start_param", () => {
  const params = new URLSearchParams({
    screen: "find",
    code: "bad-code",
  });
  const target = resolveTelegramMiniAppDeepLinkTarget(
    "/telegram/app",
    params,
    `find_${SAMPLE_CODE}`,
  );
  assert.equal(target, "/telegram/app/find");
});

test("valid start_param with invalid query code uses query code rules", () => {
  const params = new URLSearchParams({
    screen: "find",
    code: "!!!",
  });
  const target = resolveTelegramMiniAppDeepLinkTarget(
    "/telegram/app",
    params,
    `find_${SAMPLE_CODE}`,
  );
  assert.equal(target, "/telegram/app/find");
});

test("oversized start_param is ignored safely", () => {
  const oversized = "find_" + "x".repeat(600);
  assert.equal(normalizeTelegramMiniAppStartParam(oversized), null);
  const target = resolveTelegramMiniAppDeepLinkTarget(
    "/telegram/app",
    new URLSearchParams(),
    oversized,
  );
  assert.equal(target, null);
});

test("mini app APIs do not accept client user identity", () => {
  const sessionRoute = readFileSync(
    resolve(import.meta.dirname, "../app/api/telegram/mini-app/session/route.ts"),
    "utf8",
  );
  const snapsRoute = readFileSync(
    resolve(import.meta.dirname, "../app/api/telegram/mini-app/snaps/route.ts"),
    "utf8",
  );
  assert.match(sessionRoute, /initData/);
  assert.doesNotMatch(sessionRoute, /telegramUserId/);
  assert.match(snapsRoute, /getAuthenticatedAppUser/);
  assert.doesNotMatch(snapsRoute, /body\.userId/);
});

test("upload duplicate protection uses generation guard", () => {
  const upload = readFileSync(
    resolve(
      import.meta.dirname,
      "../components/telegram/TelegramMiniAppUpload.tsx",
    ),
    "utf8",
  );
  assert.match(upload, /uploadGeneration/);
  assert.match(upload, /phase\.kind === "uploading"/);
});

test("expired Telegram link challenge is detected", () => {
  const expiresAt = new Date(Date.now() - 1000);
  assert.equal(isLinkChallengeExpired(expiresAt), true);
  assert.equal(
    isLinkChallengeExpired(new Date(Date.now() + TELEGRAM_LINK_TTL_MS)),
    false,
  );
});

test("reused or invalid link token format is rejected", () => {
  assert.equal(isLinkTokenFormatValid(""), false);
  assert.equal(isLinkTokenFormatValid("short"), false);
});

test("unlink binds to authenticated app user only", () => {
  const unlink = readFileSync(
    resolve(import.meta.dirname, "../app/api/telegram/unlink/route.ts"),
    "utf8",
  );
  assert.match(unlink, /requireAuthenticatedAppUser/);
  assert.match(unlink, /unlinkTelegramAccountForUser\(user\.id\)/);
  assert.doesNotMatch(unlink, /telegramUserId.*request/);
});

test("stale Telegram chat state TTL is bounded", () => {
  assert.equal(TELEGRAM_CHAT_STATE_TTL_MS, 15 * 60 * 1000);
  const chatState = readFileSync(
    resolve(import.meta.dirname, "../lib/telegram/chat-state.ts"),
    "utf8",
  );
  assert.match(chatState, /isExpired/);
  assert.match(chatState, /clearTelegramChatState/);
});

test("bot registers global error handler for user-safe replies", () => {
  const commands = readFileSync(
    resolve(import.meta.dirname, "../lib/telegram/commands.ts"),
    "utf8",
  );
  assert.match(commands, /registerTelegramBotErrorHandler/);
  assert.match(
    readFileSync(
      resolve(import.meta.dirname, "../lib/telegram/bot-error-handler.ts"),
      "utf8",
    ),
    /TELEGRAM_BOT_USER_ERROR_MESSAGE/,
  );
  assert.equal(typeof registerTelegramBotErrorHandler, "function");
});

test("mini app unauthorized responses use session_expired code", () => {
  const home = readFileSync(
    resolve(import.meta.dirname, "../app/api/telegram/mini-app/home/route.ts"),
    "utf8",
  );
  const miniAppApi = readFileSync(
    resolve(import.meta.dirname, "../lib/telegram/mini-app-api.ts"),
    "utf8",
  );
  assert.match(home, /telegramMiniAppUnauthorizedResponse/);
  assert.match(miniAppApi, /session_expired/);
});

test("production verification script avoids printing secrets", () => {
  const script = readFileSync(
    resolve(import.meta.dirname, "../scripts/verify-telegram-production.ts"),
    "utf8",
  );
  assert.match(script, /never prints secrets/i);
  assert.match(script, /getWebhookInfo/);
  assert.doesNotMatch(script, /console\.log\(.*token/i);
});

test("mini app screens expose Reconnect for expired sessions", () => {
  const home = readFileSync(
    resolve(
      import.meta.dirname,
      "../components/telegram/TelegramMiniAppHome.tsx",
    ),
    "utf8",
  );
  const find = readFileSync(
    resolve(
      import.meta.dirname,
      "../components/telegram/TelegramMiniAppFind.tsx",
    ),
    "utf8",
  );
  assert.match(home, /TelegramMiniAppReconnect/);
  assert.match(find, /session_expired/);
  assert.match(find, /retryAuth/);
});
