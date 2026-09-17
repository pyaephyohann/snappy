/**
 * Telegram Mini App integration & deep links (T5).
 * Run: npm run test:telegram-mini-app-integration
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTelegramMiniAppDeepLink,
  buildTelegramMiniAppStartParam,
  parseTelegramMiniAppStartParam,
  resolveTelegramMiniAppDeepLinkTarget,
} from "../lib/telegram/mini-app-deep-link";
import { buildMiniAppFindEntryKeyboard } from "../lib/telegram/keyboards";

const SAMPLE_CODE = "clxyz1234567890abcdefghij";

test("canonical Mini App URL uses screen and code query params", () => {
  const previous = process.env.SNAPPY_PUBLIC_URL;
  process.env.SNAPPY_PUBLIC_URL = "https://snapppy.info";
  try {
    const url = buildTelegramMiniAppDeepLink({
      screen: "find",
      code: SAMPLE_CODE,
    });
    assert.ok(url);
    const parsed = new URL(url!);
    assert.equal(parsed.pathname, "/telegram/app");
    assert.equal(parsed.searchParams.get("screen"), "find");
    assert.equal(parsed.searchParams.get("code"), SAMPLE_CODE.toLowerCase());
  } finally {
    if (previous === undefined) {
      delete process.env.SNAPPY_PUBLIC_URL;
    } else {
      process.env.SNAPPY_PUBLIC_URL = previous;
    }
  }
});

test("resolveTelegramMiniAppDeepLinkTarget routes find with valid code", () => {
  const params = new URLSearchParams({
    screen: "find",
    code: SAMPLE_CODE,
  });
  const target = resolveTelegramMiniAppDeepLinkTarget(
    "/telegram/app",
    params,
    null,
  );
  assert.match(target ?? "", /^\/telegram\/app\/find\?code=/);
});

test("invalid Snap code falls back to Find form without code param", () => {
  const params = new URLSearchParams({
    screen: "find",
    code: "not-valid",
  });
  const target = resolveTelegramMiniAppDeepLinkTarget(
    "/telegram/app",
    params,
    null,
  );
  assert.equal(target, "/telegram/app/find");
});

test("start_param find_<code> normalizes to find route", () => {
  const target = resolveTelegramMiniAppDeepLinkTarget(
    "/telegram/app",
    new URLSearchParams(),
    `find_${SAMPLE_CODE}`,
  );
  assert.match(target ?? "", /\/telegram\/app\/find\?code=/);
});

test("malformed start_param falls back safely", () => {
  const target = resolveTelegramMiniAppDeepLinkTarget(
    "/telegram/app",
    new URLSearchParams(),
    "unknown_payload",
  );
  assert.equal(target, null);
});

test("oversized start_param is ignored", () => {
  const target = resolveTelegramMiniAppDeepLinkTarget(
    "/telegram/app",
    new URLSearchParams(),
    `find_${"x".repeat(600)}`,
  );
  assert.equal(target, null);
});

test("buildTelegramMiniAppStartParam mirrors parse format", () => {
  assert.equal(
    buildTelegramMiniAppStartParam({ screen: "find", code: SAMPLE_CODE }),
    `find_${SAMPLE_CODE.toLowerCase()}`,
  );
  const parsed = parseTelegramMiniAppStartParam(
    buildTelegramMiniAppStartParam({ screen: "find", code: SAMPLE_CODE })!,
  );
  assert.equal(parsed.screen, "find");
  assert.equal(parsed.code, SAMPLE_CODE.toLowerCase());
});

test("bot Find keyboard uses Mini App deep link", () => {
  const previous = process.env.SNAPPY_PUBLIC_URL;
  process.env.SNAPPY_PUBLIC_URL = "https://snapppy.info";
  try {
    const keyboard = buildMiniAppFindEntryKeyboard(SAMPLE_CODE);
    assert.ok(keyboard);
    const button = keyboard!.inline_keyboard.flat().find((b) => "web_app" in b);
    assert.ok(button && "web_app" in button);
    const url = new URL(button.web_app.url);
    assert.equal(url.searchParams.get("screen"), "find");
    assert.equal(url.searchParams.get("code"), SAMPLE_CODE.toLowerCase());
  } finally {
    if (previous === undefined) {
      delete process.env.SNAPPY_PUBLIC_URL;
    } else {
      process.env.SNAPPY_PUBLIC_URL = previous;
    }
  }
});

test("mini app meta and link routes do not accept client user identity", () => {
  const meta = readFileSync(
    resolve(import.meta.dirname, "../app/api/telegram/mini-app/meta/route.ts"),
    "utf8",
  );
  const find = readFileSync(
    resolve(import.meta.dirname, "../app/api/telegram/mini-app/find/route.ts"),
    "utf8",
  );
  assert.doesNotMatch(meta, /userId/);
  assert.match(find, /getSession\(/);
  assert.doesNotMatch(find, /searchParams\.get\("user/);
});

test("shell resolves deep links with start_param hook", () => {
  const shell = readFileSync(
    resolve(
      import.meta.dirname,
      "../components/telegram/TelegramMiniAppShell.tsx",
    ),
    "utf8",
  );
  assert.match(shell, /resolveTelegramMiniAppDeepLinkTarget/);
  assert.match(shell, /useTelegramMiniAppStartParam/);
});
