import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { matchFriendsByNamePartial } from "../lib/friends-search";
import {
  buildUploadTargetCallback,
  parseUploadTargetCallback,
} from "../lib/telegram/keyboards";
import {
  TELEGRAM_AWAITING_UPLOAD_TARGET,
  TELEGRAM_UPLOAD_TARGET_MODE_PREFIX,
  getTelegramUserStateKey,
} from "../lib/telegram/chat-state-constants";

test("upload recipient matching is limited to the supplied friend list", () => {
  const friends = [
    { id: "friend-1", name: "Su Su" },
    { id: "friend-2", name: "Ko Pyae" },
  ];

  assert.deepEqual(matchFriendsByNamePartial(friends, "su"), [friends[0]]);
  assert.deepEqual(matchFriendsByNamePartial(friends, "unknown"), []);
});

test("upload target callbacks preserve and parse the database user ID", () => {
  const callback = buildUploadTargetCallback("clfriend123");
  assert.equal(parseUploadTargetCallback(callback), "clfriend123");
  assert.equal(parseUploadTargetCallback("upload_target:other:value"), null);
  assert.equal(parseUploadTargetCallback("unknown:clfriend123"), null);
});

test("upload target state is distinct and scoped per chat/user", () => {
  assert.equal(TELEGRAM_AWAITING_UPLOAD_TARGET, "upload_target");
  assert.equal(TELEGRAM_UPLOAD_TARGET_MODE_PREFIX, "upload_snap_target:");
  assert.notEqual(
    getTelegramUserStateKey("chat-1", "telegram-1"),
    getTelegramUserStateKey("chat-1", "telegram-2"),
  );
});

test("Telegram upload uses selected target and linked uploader separately", () => {
  const source = readFileSync(
    resolve(import.meta.dirname, "../lib/telegram/upload-snap.ts"),
    "utf8",
  );

  assert.match(source, /listSnappyFriendsForUser\(linked\.userId\)/);
  assert.match(source, /getAwaitingSnapUploadTarget/);
  assert.match(source, /targetUserId,\s*uploadedById: linked\.userId/);
  assert.match(source, /setAwaitingSnapUploadForTarget/);
  assert.match(source, /UPLOAD_TARGET_STALE_MESSAGE/);
});
