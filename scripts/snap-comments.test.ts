/**
 * Snap comments — C1 backend/data foundation.
 *
 * The Comment model and POST/GET routes pre-exist this milestone; C1 hardens
 * exactly two behaviors and locks the contract with tests:
 *
 * - body validation trims BEFORE min/max so a whitespace-only comment is
 *   rejected (never silently stored as "")
 * - GET is cursor/keyset paginated (never unbounded), using the same
 *   convention as /api/notifications and /api/snaps/[snapId]/reactions
 *
 * Also locked: authentication first, author resolved server-side only,
 * Snap existence as the access rule, no DELETE/PUT/PATCH (deletion is
 * explicitly deferred), and no Spark/payment vocabulary anywhere near the
 * comment surface.
 *
 * Run: node --env-file-if-exists=.env.local --import tsx --test scripts/snap-comments.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const route = read("app/api/snaps/[snapId]/comments/route.ts");

// ===========================================================================
// Creation — validation
// ===========================================================================

test("comment body uses the shared max length with trim-before-validate", () => {
  // Single source of truth shared with the composer input's maxLength.
  const lib = read("lib/snap-reactions.ts");
  assert.match(lib, /export const MAX_COMMENT_LENGTH = 500;/);
  assert.match(
    route,
    /import \{ MAX_COMMENT_LENGTH \} from '@\/lib\/snap-reactions';/,
  );

  // No second copy of the limit inside the route.
  assert.doesNotMatch(route, /const MAX_COMMENT_LENGTH = \d/);

  // Trim runs BEFORE min/max: whitespace-only input must be rejected as
  // empty instead of being stored as "".
  assert.match(
    route,
    /content: z\.string\(\)\s*\.trim\(\)\s*\.min\(1, 'Comment cannot be empty'\)/,
  );
  assert.match(route, /\.max\(MAX_COMMENT_LENGTH/);

  // Validation failure is a 400 with the issue message.
  assert.match(route, /validationResult\.error\.issues\[0\]\.message/);
  assert.match(route, /\{ status: 400 \}/);
});

// ===========================================================================
// Authentication + author identity
// ===========================================================================

test("both comment operations require a session and reject with 401", () => {
  const sessionCalls = route.match(/requireSession\(\)/g);
  assert.equal(sessionCalls?.length, 2, "POST and GET each call requireSession");
  assert.match(route, /if \(!session \|\| !session\.authenticated\) \{/);
  assert.equal(route.match(/401/g)?.length, 2, "both handlers reject with 401");

  // POST validates before touching the database.
  const postIndex = route.indexOf("export async function POST");
  const getIndex = route.indexOf("export async function GET");
  assert.ok(postIndex >= 0 && getIndex > postIndex);
  assert.ok(
    route.indexOf("safeParse", postIndex) < route.indexOf("prisma.comment.create", postIndex),
    "body validation runs before comment creation",
  );
  assert.ok(
    route.indexOf("requireSession", postIndex) < route.indexOf("safeParse", postIndex),
    "authentication runs before body validation",
  );
});

test("the author is resolved from the session — never from the client", () => {
  assert.match(route, /resolveUserFromSession\(session\)/);
  // The create call uses the resolved user id and the route param only.
  assert.match(route, /userId: user\.id,\s*\n\s*snapId,/);

  // No client-controlled identity anywhere in the payload handling.
  assert.doesNotMatch(route, /body\.userId|body\.authorId|parsed\.data\.userId/);
  // The schema accepts exactly one field: content.
  assert.match(route, /const createCommentSchema = z\.object\(\{\s*content:/);
  assert.doesNotMatch(
    route,
    /createCommentSchema = z\.object\(\{[\s\S]{0,120}userId/,
  );
});

// ===========================================================================
// Access rule — Snap must exist
// ===========================================================================

test("a comment requires an existing Snap (404) after authentication", () => {
  const getStart = route.indexOf("export async function GET");
  const postStart = route.indexOf("export async function POST");
  assert.ok(postStart >= 0 && getStart > postStart);
  const handlers: Array<[string, string]> = [
    ["POST", route.slice(postStart, getStart)],
    ["GET", route.slice(getStart)],
  ];
  for (const [handler, source] of handlers) {
    assert.match(source, /prisma\.snap\.findUnique\(/, `${handler} resolves the Snap`);
    assert.match(source, /\{ status: 404 \}/, `${handler} 404s on missing Snap`);
  }
  // Creation only proceeds after the snap and user are both resolved.
  assert.ok(
    route.indexOf("prisma.snap.findUnique") < route.indexOf("prisma.comment.create"),
  );
});

// ===========================================================================
// Pagination
// ===========================================================================

test("comment list is cursor-paginated, newest first, and never unbounded", () => {
  // Same convention as /api/notifications and the Snap reactors list.
  assert.match(route, /const COMMENTS_PAGE_SIZE = 30;/);
  assert.match(
    route,
    /request\.nextUrl\.searchParams\.get\('cursor'\)/,
  );
  assert.match(route, /orderBy:\s*\{\s*createdAt: 'desc',\s*\}/);
  assert.match(route, /take: COMMENTS_PAGE_SIZE \+ 1,/);
  assert.match(route, /cursor: \{ id: cursor \}, skip: 1/);

  // Deterministic keyset continuation: nextCursor = last returned id.
  assert.match(route, /const hasMore = comments\.length > COMMENTS_PAGE_SIZE;/);
  assert.match(route, /nextCursor: hasMore \? page\[page\.length - 1\]\.id : null/);

  // The response keeps the `comments` key (existing UI contract) and adds
  // `nextCursor`; the like-state lookup is scoped to the returned page.
  assert.match(route, /comments: commentsWithLikeInfo,/);
  assert.match(route, /in: page\.map\(c => c\.id\),/);

  // Guard against regressing to an unbounded findMany.
  assert.equal(
    route.match(/prisma\.comment\.findMany\(/g)?.length,
    1,
    "exactly one comment list query",
  );
  assert.ok(route.includes("take: COMMENTS_PAGE_SIZE + 1"));
});

// ===========================================================================
// Deletion deferred + scope boundaries
// ===========================================================================

test("no comment edit or deletion endpoints exist (explicitly deferred)", () => {
  assert.doesNotMatch(route, /export async function (DELETE|PUT|PATCH)/);
  // Only the two documented operations are exported.
  assert.equal(route.match(/export async function /g)?.length, 2);
});

test("comment surface stays out of the Spark economy and payments", () => {
  assert.doesNotMatch(route, /\bspark\b|sparkTransaction|canAfford/i);
  assert.doesNotMatch(
    route,
    /checkout|purchase|KPay|AYA Pay|UAB Pay|Stripe|payment/i,
  );
  // Sparks terminology only — never "points".
  assert.doesNotMatch(route, /\b(?:points?|coins?|XP|gems?)\b/i);
});

// ===========================================================================
// Existing wiring stays intact (pre-existing behavior this milestone keeps)
// ===========================================================================

test("successful creation returns the persisted comment with author fields", () => {
  assert.match(route, /include: \{\s*user: \{\s*select: \{\s*id: true,\s*name: true,\s*profileImage: true,/);
  assert.match(route, /return NextResponse\.json\(\{\s*comment: \{/);
  assert.match(route, /\{ status: 201 \}/);
  assert.match(route, /likeCount,/);
  assert.match(route, /liked: false,/);
});
