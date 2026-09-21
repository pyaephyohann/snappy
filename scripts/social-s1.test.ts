/**
 * Social S1 relationship architecture and route security tests.
 * Run: node --import tsx --test scripts/social-s1.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  relationshipStateFromFlags,
  type RelationshipState,
} from "../lib/relationship-state";

const root = resolve(import.meta.dirname, "..");
function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

test("mutual follow is the only friend state", () => {
  const cases: Array<[
    boolean,
    boolean,
    RelationshipState
  ]> = [
    [true, false, { isFollowing: true, isFollowedBy: false, isFriend: false }],
    [false, true, { isFollowing: false, isFollowedBy: true, isFriend: false }],
    [true, true, { isFollowing: true, isFollowedBy: true, isFriend: true }],
    [false, false, { isFollowing: false, isFollowedBy: false, isFriend: false }],
  ];

  for (const [isFollowing, isFollowedBy, expected] of cases) {
    assert.deepEqual(
      relationshipStateFromFlags(isFollowing, isFollowedBy),
      expected,
    );
  }
});

test("follow schema prevents duplicate directed relationships", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model UserFollow/);
  assert.match(schema, /@@unique\(\[followerId, followingId\]\)/);
  assert.match(schema, /@relation\("UserFollows"/);
  assert.match(schema, /@relation\("UserFollowers"/);
  assert.doesNotMatch(schema, /model Friendship/);
});

test("follow routes derive identity from the authenticated user", () => {
  const follow = read("app/api/users/[userId]/follow/route.ts");
  const relationship = read("app/api/users/[userId]/relationship/route.ts");
  const friends = read("app/api/friends/route.ts");

  for (const route of [follow, relationship, friends]) {
    assert.match(route, /getAuthenticatedAppUser/);
    assert.match(route, /Unauthorized/);
  }
  assert.match(follow, /followerId: viewer\.id/);
  assert.doesNotMatch(follow, /body\.followerId/);
  assert.match(follow, /viewer\.id === targetUserId/);
  assert.match(follow, /P2002/);
  assert.match(relationship, /getRelationshipState/);
  assert.match(friends, /listFriendsForUser/);
});

test("friends query requires both directed follow records and active users", () => {
  const relationships = read("lib/relationships.ts");
  assert.match(relationships, /isActive: true/);
  assert.match(relationships, /followers: \{ some: \{ followerId: viewerId \} \}/);
  assert.match(relationships, /following: \{ some: \{ followingId: viewerId \} \}/);
  assert.match(relationships, /take: pageSize \+ 1/);
  assert.match(relationships, /orderBy: \{ id: "asc" \}/);
});

test("web and Telegram profile surfaces use shared relationship state", () => {
  assert.match(read("app/friends/[username]/page.tsx"), /getRelationshipState/);
  assert.match(read("app/telegram/app/friends/[username]/page.tsx"), /getRelationshipState/);
  assert.match(read("components/friends/FriendProfileClient.tsx"), /FollowButton/);
  assert.match(read("app/api/users/list/route.ts"), /listUsersForViewer/);
  assert.match(read("components/telegram/TelegramMiniAppSearch.tsx"), /api\/users\/list/);
});

test("S1 leaves later social milestones scoped", () => {
  const docs = read("docs/social.md");
  assert.match(docs, /S2 — Chat Backend — Implemented/);
  assert.match(docs, /S3 — Chat UI/);
  assert.match(docs, /S4 — Near-Realtime Chat Synchronization/);
  assert.match(docs, /S5 — Message Reactions/);
  assert.match(docs, /S6 — Notifications \(planned\)/);
  assert.match(docs, /S7 — User Status \(planned\)/);
});
