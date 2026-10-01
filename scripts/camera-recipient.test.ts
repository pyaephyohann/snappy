/**
 * Camera recipient list regression tests —
 * "Hide the current user from the mobile Camera recipient list".
 *
 * Covers:
 * - `/api/users/list` supports an opt-in `excludeSelf=1` flag that maps to the
 *   server-side query exclusion (`excludeUserId: user.id` from the session),
 *   never a client-supplied user id
 * - `BottomNavCameraFlow` (the shared Snap recipient picker) requests the
 *   viewer-excluded list on the initial page AND on "Load more"
 * - search surfaces keep the full user list (no global removal)
 * - live: given eligible users A, B, C the recipient list is B, C; given only
 *   the current user it is empty; query-level exclusion keeps pages full
 *
 * Run: node --env-file-if-exists=.env.local --import tsx --test scripts/camera-recipient.test.ts
 */

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PrismaClient } from "@prisma/client";

const hasDb = Boolean(process.env.DATABASE_URL);
const SKIP = !hasDb ? "DATABASE_URL not set" : false;

const root = resolve(import.meta.dirname, "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

let prisma: PrismaClient | null = null;
const testUserIds: string[] = [];

async function db(): Promise<PrismaClient> {
  if (!prisma) {
    const { PrismaClient: PrismaClientCtor } = await import("@prisma/client");
    prisma = new PrismaClientCtor();
  }
  return prisma;
}

async function createTestUser(name: string): Promise<string> {
  const client = await db();
  const user = await client.user.create({
    data: {
      name,
      profileImage: "https://example.com/avatar.jpg",
    },
  });
  testUserIds.push(user.id);
  return user.id;
}

before(async () => {
  if (!hasDb) return;
  const client = await db();
  await client.user.deleteMany({
    where: { name: { startsWith: "camera_recipient_" } },
  });
});

after(async () => {
  if (!prisma) return;
  for (const userId of testUserIds) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

// ===========================================================================
// Source-level wiring (always run)
// ===========================================================================

test("users list API supports opt-in viewer exclusion driven by the server session", () => {
  const route = read("app/api/users/list/route.ts");

  assert.match(route, /searchParams\.get\("excludeSelf"\) === "1"/);
  // The excluded identity comes from the session user, never the client.
  assert.match(route, /\.\.\.\(excludeSelf \? \{ excludeUserId: user\.id \} : \{\}\)/);
  assert.match(route, /listUsersForViewerPage/);
  // Existing contract stays intact.
  assert.match(route, /searchParams\.get\("cursor"\)/);
  assert.match(route, /searchParams\.get\("query"\)/);
  assert.match(route, /NextResponse\.json\(page\.users\)/);
  // No client-supplied user id may influence the exclusion.
  assert.doesNotMatch(route, /excludeUserId:\s*(request|body|params)/);
});

test("camera recipient picker requests the viewer-excluded list on every page", () => {
  const flow = read("components/mobile/BottomNavCameraFlow.tsx");

  // Initial page and "Load more" both omit the viewer.
  assert.match(flow, /fetch\("\/api\/users\/list\?excludeSelf=1"\)/);
  assert.match(
    flow,
    /`\/api\/users\/list\?excludeSelf=1&cursor=\$\{encodeURIComponent\(nextCursor\)\}`/,
  );
  // The shared picker and upload flow are untouched.
  assert.match(flow, /FriendsPickerPanel/);
  assert.match(flow, /uploadSnapForUser/);
});

test("search surfaces keep discovery semantics (server excludes the viewer)", () => {
  for (const file of [
    "components/layout/NavbarDesktopFriendSearch.tsx",
    "components/search/FriendsSearchClient.tsx",
    "components/telegram/TelegramMiniAppSearch.tsx",
  ]) {
    assert.doesNotMatch(read(file), /excludeSelf/, file);
  }
  // F1: search stays a discovery surface, but the viewer's own account is
  // excluded server-side so it is never offered as a person to follow.
  const searchPage = read("app/search/page.tsx");
  assert.match(searchPage, /listUsersForViewerPage/);
  assert.match(searchPage, /excludeUserId: user\.id/);
});

// ===========================================================================
// Database-backed behavior (run with DATABASE_URL)
// ===========================================================================

test("current user never appears in the recipient list (A, B, C → B, C)", { skip: SKIP }, async () => {
  const { listUsersForViewerPage } = await import("../lib/relationships");
  const prefix = "camera_recipient_abc_";
  const userA = await createTestUser(`${prefix}aaa`);
  const userB = await createTestUser(`${prefix}bbb`);
  const userC = await createTestUser(`${prefix}ccc`);

  const page = await listUsersForViewerPage({
    viewerId: userA,
    limit: 50,
    query: prefix,
    excludeUserId: userA,
  });

  assert.deepEqual(
    page.users.map((user) => user.id),
    [userB, userC],
    "recipient list must be exactly the other eligible users, in (name asc, id asc) order",
  );
  assert.equal(
    page.users.some((user) => user.id === userA),
    false,
    "the current user must not appear as their own recipient",
  );
});

test("recipient list is empty when only the current user is eligible", { skip: SKIP }, async () => {
  const { listUsersForViewerPage } = await import("../lib/relationships");
  const prefix = "camera_recipient_solo_";
  const userA = await createTestUser(`${prefix}aaa`);

  const page = await listUsersForViewerPage({
    viewerId: userA,
    limit: 50,
    query: prefix,
    excludeUserId: userA,
  });

  assert.deepEqual(page.users, [], "empty recipient state when nobody else is eligible");
  assert.equal(page.nextCursor, null);
});

test("query-level viewer exclusion keeps recipient pages full", { skip: SKIP }, async () => {
  const { listUsersForViewerPage } = await import("../lib/relationships");
  const prefix = "camera_recipient_page_";
  const userA = await createTestUser(`${prefix}aaa`);
  const userB = await createTestUser(`${prefix}bbb`);
  const userC = await createTestUser(`${prefix}ccc`);
  const userD = await createTestUser(`${prefix}ddd`);

  // limit 2 must return two OTHER users — the excluded viewer must not eat a
  // page slot (the documented rationale for query-level exclusion).
  const page = await listUsersForViewerPage({
    viewerId: userA,
    limit: 2,
    query: prefix,
    excludeUserId: userA,
  });

  assert.deepEqual(
    page.users.map((user) => user.id),
    [userB, userC],
    "a 2-slot page holds 2 non-viewer users",
  );
  assert.ok(page.nextCursor, "page must continue to the remaining user");

  const rest = await listUsersForViewerPage({
    viewerId: userA,
    limit: 2,
    query: prefix,
    excludeUserId: userA,
    cursor: page.nextCursor,
  });
  assert.deepEqual(rest.users.map((user) => user.id), [userD]);
  assert.equal(rest.nextCursor, null);
});
