/**
 * Milestone F1 — canonical Friends contract tests.
 *
 * Source-level assertions pin the architecture; the DATABASE_URL-guarded
 * runtime tests assert real behavior against Postgres using run-scoped rows
 * and cleanup of only those rows (same safety pattern as
 * scripts/social-integration.test.ts).
 *
 * Run: npm run test:friends-contract
 */
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PrismaClient } from "@prisma/client";

const root = resolve(import.meta.dirname, "..");
function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

// ── 1. Canonical friends query ─────────────────────────────────────

test("listFriendsForUser keeps mutual-follow semantics and viewer exclusion", () => {
  const relationships = read("lib/relationships.ts");
  assert.match(
    relationships,
    /followers: \{ some: \{ followerId: viewerId \} \}/,
  );
  assert.match(
    relationships,
    /following: \{ some: \{ followingId: viewerId \} \}/,
  );
  assert.match(relationships, /id: \{ not: viewerId \}/);
  assert.match(relationships, /isActive: true/);
  // Stable keyset pagination: (name asc, id asc) with the shared cursor codec.
  assert.match(relationships, /orderBy: \[\{ name: "asc" \}, \{ id: "asc" \}\]/);
  assert.match(relationships, /encodeUserListCursor\(\{ name: last\.name, id: last\.id \}\)/);
});

test("/api/friends is an authenticated canonical-friends API", () => {
  const route = read("app/api/friends/route.ts");
  assert.match(route, /getAuthenticatedAppUser/);
  assert.match(route, /Unauthorized/);
  assert.match(route, /listFriendsForUser\(\{\s*viewerId: viewer\.id/);
  // Only the mutual-follow query may serve the friends API.
  assert.doesNotMatch(route, /listUsersForViewer/);
  // Cursor validation uses the shared decoder — never a length-based regex,
  // which would reject legitimate opaque cursors longer than 64 characters.
  assert.match(route, /decodeUserListCursor\(cursor\)/);
  assert.doesNotMatch(route, /isValidCursor|\{1,64\}/);
});

// ── 2. Telegram semantics split ────────────────────────────────────

test("bot /find_friends and My Friends use the canonical friends query", () => {
  const findFriends = read("lib/telegram/find-friends.ts");
  // The actual Friends list must come from the mutual-follow query.
  assert.match(findFriends, /listFriendsForUser\(\{\s*viewerId: linked\.userId/);
  // An all-users list function must not feed the bot Friends flows.
  assert.doesNotMatch(findFriends, /listSnappyRecipientsForUser|listUsersForViewer/);
  // Pagination state and snaps paging remain intact.
  assert.match(findFriends, /getFindFriendsState/);
  assert.match(findFriends, /setFindFriendsPagination/);
  assert.match(findFriends, /listFriendSnapsForTelegramPage/);
  assert.match(findFriends, /beginMyFriendsFlow/);
});

test("upload targeting keeps the named recipients list (not friends)", () => {
  const upload = read("lib/telegram/upload-snap.ts");
  assert.match(upload, /listSnappyRecipientsForUser\(linked\.userId\)/);
  assert.doesNotMatch(upload, /listSnappyFriendsForUser|listFriendsForUser/);
  assert.match(upload, /getSnappyFriendTarget/);
  assert.match(upload, /isSnappyFriendTarget/);

  const snappyFriends = read("lib/snappy-friends.ts");
  // No function named "friends" silently means all active users.
  assert.match(snappyFriends, /export async function listSnappyRecipientsForUser/);
  assert.doesNotMatch(snappyFriends, /listSnappyFriendsForUser/);
  assert.match(snappyFriends, /SNAPPY_RECIPIENTS_PAGE_SIZE = 50/);
  assert.match(snappyFriends, /getSnappyFriendTarget/);
  assert.match(snappyFriends, /isSnappyFriendTarget/);
});

// ── 3. Search / discovery surfaces ─────────────────────────────────

test("search excludes the viewer but stays a discovery surface", () => {
  const searchPage = read("app/search/page.tsx");
  assert.match(searchPage, /listUsersForViewerPage/);
  assert.match(searchPage, /excludeUserId: user\.id/);
  assert.doesNotMatch(searchPage, /listFriendsForUser/);

  // Camera recipient picker keeps its existing excludeSelf contract.
  const flow = read("components/mobile/BottomNavCameraFlow.tsx");
  assert.match(flow, /fetch\("\/api\/users\/list\?excludeSelf=1"\)/);
});

test("Friends UI exists on web and Telegram and consumes the canonical API", () => {
  const friendsPage = read("app/friends/page.tsx");
  assert.match(friendsPage, /listFriendsForUser\(\{\s*viewerId: user\.id/);
  assert.match(friendsPage, /No friends yet/);
  assert.match(friendsPage, /FriendCard/);

  const telegramFriends = read("components/telegram/TelegramMiniAppFriends.tsx");
  assert.match(telegramFriends, /fetch\("\/api\/friends"/);
  assert.match(telegramFriends, /Loading friends…/);
  assert.match(telegramFriends, /No friends yet/);
  assert.match(telegramFriends, /Could not load friends\./);
  assert.match(telegramFriends, /TelegramMiniAppReconnect/);

  // Route registered in the Mini App routes map + profile entry point.
  const routes = read("lib/telegram/mini-app-routes.ts");
  assert.match(routes, /friends: `\$\{TELEGRAM_MINI_APP_ROOT\}\/friends`/);
  assert.match(
    read("components/telegram/TelegramMiniAppProfile.tsx"),
    /friends/,
  );
  // Bot entry: callback registered and keyboard button present.
  assert.match(read("lib/telegram/commands.ts"), /TELEGRAM_CALLBACK\.friends/);
  assert.match(read("lib/telegram/keyboards.ts"), /My Friends/);
});

test("Home remains Snap-feed-only with no Friends section", () => {
  const shared = read("components/home/HomeContent.tsx");
  const homePage = read("app/home/page.tsx");
  assert.match(shared, /RecentSnaps/);
  assert.match(shared, /HeroCarousel/);
  assert.doesNotMatch(shared, /FriendCard|friends|Friends/i);
  assert.doesNotMatch(homePage, /friends=\{/);
});

test("chat friendship authorization still requires mutual follows", () => {
  const chat = read("lib/chat.ts");
  assert.match(chat, /relationship\.isFriend/);
  assert.match(chat, /areUsersFriends\(viewerId, access\.otherParticipant\.userId\)/);
});

// ── 4. Runtime behavior (DATABASE_URL-guarded, run-scoped rows) ────

const hasDatabase = Boolean(process.env.DATABASE_URL);
const runId = `f1_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const createdUserIds: string[] = [];
let prisma: PrismaClient | null = null;

async function createUser(label: string) {
  const user = await prisma!.user.create({
    data: {
      name: `${runId}_${label}`,
      profileImage: "https://example.com/f1-test.jpg",
      isActive: true,
    },
    select: { id: true, name: true },
  });
  createdUserIds.push(user.id);
  return user;
}

test(
  "friends runtime contract",
  { skip: hasDatabase ? false : "DATABASE_URL not set" },
  async (t) => {
    before(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
    });

    after(async () => {
      // Cleanup deletes only this run's rows (cascades to follows).
      if (prisma) {
        await prisma.user.deleteMany({
          where: { id: { in: createdUserIds } },
        });
        await prisma.$disconnect();
      }
    });

    await t.test("one-way follow is NOT friendship", async () => {
      const { listFriendsForUser } = await import("../lib/relationships");
      const a = await createUser("a");
      const b = await createUser("b");
      await prisma!.userFollow.create({
        data: { followerId: a.id, followingId: b.id },
      });

      const pageForA = await listFriendsForUser({ viewerId: a.id });
      assert.deepEqual(pageForA.users, [], "A follows B only: no friends");

      const pageForB = await listFriendsForUser({ viewerId: b.id });
      assert.deepEqual(pageForB.users, [], "B is followed by A only: no friends");
    });

    await t.test("mutual follow IS friendship", async () => {
      const { listFriendsForUser } = await import("../lib/relationships");
      const a = await createUser("mutual_a");
      const b = await createUser("mutual_b");
      await prisma!.userFollow.create({
        data: { followerId: a.id, followingId: b.id },
      });
      await prisma!.userFollow.create({
        data: { followerId: b.id, followingId: a.id },
      });

      const pageForA = await listFriendsForUser({ viewerId: a.id });
      assert.deepEqual(
        pageForA.users.map((user) => user.name),
        [b.name],
      );
      assert.equal(pageForA.users[0].relationship.isFriend, true);
      assert.equal(pageForA.users[0].relationship.isFollowing, true);
      assert.equal(pageForA.users[0].relationship.isFollowedBy, true);

      const pageForB = await listFriendsForUser({ viewerId: b.id });
      assert.deepEqual(
        pageForB.users.map((user) => user.name),
        [a.name],
      );
    });

    await t.test(
      "the viewer never appears as their own friend; inactive users are excluded",
      async () => {
        const { listFriendsForUser } = await import("../lib/relationships");
        const a = await createUser("selfcheck");
        const b = await createUser("friend_b");
        const inactive = await createUser("inactive");
        await prisma!.user.update({
          where: { id: inactive.id },
          data: { isActive: false },
        });
        // Mutual follows with both b and the deactivated account.
        for (const other of [b.id, inactive.id]) {
          await prisma!.userFollow.create({
            data: { followerId: a.id, followingId: other },
          });
          await prisma!.userFollow.create({
            data: { followerId: other, followingId: a.id },
          });
        }
        // Self-follow row (schema allows it; friendship logic must ignore it).
        await prisma!.userFollow.create({
          data: { followerId: a.id, followingId: a.id },
        });

        const page = await listFriendsForUser({ viewerId: a.id });
        const names = page.users.map((user) => user.name);
        assert.deepEqual(names, [b.name]);
        assert.ok(!names.includes(a.name), "viewer never in their own list");
      },
    );

    await t.test("query filters and pagination stay bounded and ordered", async () => {
      const { listFriendsForUser } = await import("../lib/relationships");
      const a = await createUser("pager_a");
      const b1 = await createUser("pager_b1");
      const b2 = await createUser("pager_b2");
      for (const other of [b1, b2]) {
        await prisma!.userFollow.create({
          data: { followerId: a.id, followingId: other.id },
        });
        await prisma!.userFollow.create({
          data: { followerId: other.id, followingId: a.id },
        });
      }

      // Server-side name filter only matches canonical friends.
      const queryPage = await listFriendsForUser({
        viewerId: a.id,
        query: "b2",
      });
      assert.deepEqual(queryPage.users.map((user) => user.name), [b2.name]);
      assert.equal(queryPage.nextCursor, null);

      // Two friends, page size 1: first page plus a cursor for the rest.
      const first = await listFriendsForUser({ viewerId: a.id, limit: 1 });
      assert.equal(first.users.length, 1);
      assert.ok(first.nextCursor, "cursor present when more friends remain");

      // The cursor resumes exactly where the first page stopped.
      const second = await listFriendsForUser({
        viewerId: a.id,
        limit: 1,
        cursor: first.nextCursor,
      });
      assert.equal(second.users.length, 1);
      assert.equal(second.nextCursor, null, "no cursor when nothing remains");
      assert.deepEqual(
        [first.users[0].name, second.users[0].name].sort(),
        [b1.name, b2.name].sort(),
        "both friends are reached across the two pages",
      );

      // A single unpaginated page lists every friend, name-ordered.
      const ordered = await listFriendsForUser({ viewerId: a.id });
      const names = ordered.users.map((user) => user.name);
      assert.equal(names.length, 2);
      assert.deepEqual(names, [...names].sort(), "ordered by name asc");
      assert.equal(ordered.nextCursor, null);
    });

    await t.test(
      "a legitimate cursor longer than 64 chars is valid for /api/friends",
      async () => {
        const { encodeUserListCursor, decodeUserListCursor } =
          await import("../lib/relationships");

        // A page-1 boundary with a realistic name produces a >64-char cursor
        // (the exact shape the route previously rejected via /{1,64}/).
        const cursor = encodeUserListCursor({
          name: "Ma Pyone Pyone",
          id: "cmt6e599y0004jv0484qrzug7",
        });
        assert.ok(cursor.length > 64, "cursor exceeds the legacy 64-char limit");
        assert.notEqual(
          decodeUserListCursor(cursor),
          null,
          "shared decoder (used by the route) accepts it",
        );
        assert.deepEqual(decodeUserListCursor(cursor), {
          name: "Ma Pyone Pyone",
          id: "cmt6e599y0004jv0484qrzug7",
        });

        // Malformed cursors are still rejected by the same decoder.
        assert.equal(decodeUserListCursor("short"), null);
        assert.equal(decodeUserListCursor("!!!!"), null);
        assert.equal(
          decodeUserListCursor(
            Buffer.from(JSON.stringify({ id: 123 })).toString("base64url"),
          ),
          null,
        );
        assert.equal(decodeUserListCursor(null), null);
      },
    );
  },
);
