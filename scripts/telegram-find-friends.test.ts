/**
 * Telegram /find-friends logic tests.
 * Run: npm run test:telegram-find-friends
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  matchFriendsByNamePartial,
  type FriendNameMatch,
} from "../lib/friends-search";
import {
  formatFindFriendsIntro,
  formatFindFriendsMultipleMatches,
} from "../lib/telegram/messages";
import { TELEGRAM_AWAITING_FIND_FRIENDS } from "../lib/telegram/chat-state-constants";

const friends: FriendNameMatch[] = [
  { id: "1", name: "Pyae Phyo" },
  { id: "2", name: "Pyae Aung" },
  { id: "3", name: "Alice" },
];

test("matchFriendsByNamePartial is case-insensitive and partial", () => {
  assert.deepEqual(matchFriendsByNamePartial(friends, "alice"), [friends[2]]);
  assert.deepEqual(matchFriendsByNamePartial(friends, "pyae"), [
    friends[0],
    friends[1],
  ]);
  assert.deepEqual(matchFriendsByNamePartial(friends, "Pyae Phyo"), [
    friends[0],
  ]);
});

test("formatFindFriendsIntro lists friend names", () => {
  const text = formatFindFriendsIntro(["Alice", "Bob"]);
  assert.match(text, /Your friends/);
  assert.match(text, /Alice/);
  assert.match(text, /Bob/);
});

test("formatFindFriendsMultipleMatches lists numbered options", () => {
  const text = formatFindFriendsMultipleMatches([
    { name: "Pyae Phyo" },
    { name: "Pyae Aung" },
  ]);
  assert.match(text, /1\. Pyae Phyo/);
  assert.match(text, /2\. Pyae Aung/);
});

test("find-friends command registered and find snap removed", () => {
  const commands = readFileSync(
    resolve(import.meta.dirname, "../lib/telegram/commands.ts"),
    "utf8",
  );
  assert.match(commands, /command: "find_friends"/);
  assert.doesNotMatch(commands, /command: "find"/);
  assert.doesNotMatch(commands, /find-snap/);
  assert.match(commands, /handleFindFriendsNameMessage/);
  assert.match(commands, /bot\.command\(\["find_friends", "find-friends"\]/);
});

test("find friends handler uses pagination state and page size 3", () => {
  const handler = readFileSync(
    resolve(import.meta.dirname, "../lib/telegram/find-friends.ts"),
    "utf8",
  );
  assert.match(handler, /getFindFriendsState/);
  assert.match(handler, /setFindFriendsPagination/);
  assert.match(handler, /listFriendSnapsForTelegramPage/);
  const snapsModule = readFileSync(
    resolve(import.meta.dirname, "../lib/telegram/find-friends-snaps.ts"),
    "utf8",
  );
  assert.match(snapsModule, /FIND_FRIENDS_SNAPS_PAGE_SIZE = 3/);
  assert.equal(TELEGRAM_AWAITING_FIND_FRIENDS, "find_friends");
});
