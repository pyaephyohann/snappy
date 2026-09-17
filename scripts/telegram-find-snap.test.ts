/**
 * Telegram find-snap logic tests (Node built-in test runner).
 * Run: npm run test:telegram-find
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  isTelegramCommandText,
  normalizeSnapLookupCode,
} from "../lib/snap-code";
import {
  buildAbsoluteSnappyUrl,
  formatSnapDateForTelegram,
  isSnapDiscoverable,
  isTelegramSafeImageUrl,
} from "../lib/snap-telegram";
import { buildFriendProfileUrl } from "../lib/notifications/internal-url";
import { formatFindFoundMessage } from "../lib/telegram/messages";
import { TELEGRAM_CHAT_STATE_TTL_MS } from "../lib/telegram/chat-state-constants";

test("normalizeSnapLookupCode accepts a typical Snap id", () => {
  const sample = "clxyz1234567890abcdefghij";
  const result = normalizeSnapLookupCode(`  ${sample.toUpperCase()}  `);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.code, sample.toLowerCase());
  }
});

test("normalizeSnapLookupCode rejects empty and oversized input", () => {
  assert.equal(normalizeSnapLookupCode("   ").ok, false);
  assert.equal(normalizeSnapLookupCode("x".repeat(100)).ok, false);
});

test("normalizeSnapLookupCode rejects malformed codes", () => {
  assert.equal(normalizeSnapLookupCode("SNAP-ABC123").ok, false);
  assert.equal(normalizeSnapLookupCode("not-a-cuid").ok, false);
});

test("isTelegramCommandText detects commands", () => {
  assert.equal(isTelegramCommandText("/help"), true);
  assert.equal(isTelegramCommandText("  /find"), true);
  assert.equal(isTelegramCommandText("clxyz1234567890abcdefghij"), false);
});

test("isSnapDiscoverable requires an active owner", () => {
  assert.equal(isSnapDiscoverable(true), true);
  assert.equal(isSnapDiscoverable(false), false);
});

test("buildAbsoluteSnappyUrl uses SNAPPY-style origin without inventing domains", () => {
  const path = buildFriendProfileUrl("Alice");
  assert.equal(
    buildAbsoluteSnappyUrl("https://snappy.example", path),
    "https://snappy.example/friends/Alice",
  );
  assert.equal(buildAbsoluteSnappyUrl(null, path), null);
});

test("isTelegramSafeImageUrl allows Cloudinary https only", () => {
  assert.equal(
    isTelegramSafeImageUrl(
      "https://res.cloudinary.com/demo/image/upload/v1/snappy/snaps/photo.jpg",
    ),
    true,
  );
  assert.equal(isTelegramSafeImageUrl("http://res.cloudinary.com/x"), false);
  assert.equal(isTelegramSafeImageUrl("https://evil.example/photo.jpg"), false);
});

test("formatFindFoundMessage includes creator and optional view hint", () => {
  const withUrl = formatFindFoundMessage({
    creatorName: "Alice",
    createdLabel: formatSnapDateForTelegram(new Date("2026-01-15T12:00:00Z")),
    caption: "Beach day",
    viewUrl: "https://snappy.example/friends/Alice",
  });
  assert.match(withUrl, /Snap found!/);
  assert.match(withUrl, /Alice/);
  assert.match(withUrl, /Beach day/);

  const withoutUrl = formatFindFoundMessage({
    creatorName: "Bob",
    createdLabel: "Jan 1, 2026",
    caption: null,
    viewUrl: null,
  });
  assert.match(withoutUrl, /public URL is not configured/);
});

test("chat state TTL is bounded for serverless safety", () => {
  assert.equal(TELEGRAM_CHAT_STATE_TTL_MS, 15 * 60 * 1000);
});
