/**
 * Snap comments — C2 UI.
 *
 * The comments UI pre-exists this milestone (SnapSocialBar → SnapCommentsSheet,
 * shared by Web/PWA and the Telegram Mini App through SnapViewer / SnapCard).
 * C2 adds cursor pagination ("Load more comments") so the sheet consumes the
 * C1 keyset API instead of stopping at the first page, and locks the full
 * sheet contract with tests: render, loading/empty/error states, submit,
 * server-validation surfacing, duplicate-submission guarding, clear-after-
 * success, and the unchanged like behavior around it.
 *
 * Run: node --env-file-if-exists=.env.local --import tsx --test scripts/snap-comments-ui.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const sheet = read("components/snaps/SnapCommentsSheet.tsx");
const socialBar = read("components/snaps/SnapSocialBar.tsx");
const viewer = read("components/snaps/SnapViewer.tsx");

// ===========================================================================
// 1. Comments render in the Snap viewer
// ===========================================================================

test("Snap viewer exposes the social bar and its comments entry point", () => {
  // Viewer → social bar (with the snap id).
  assert.match(viewer, /<SnapSocialBar/);
  assert.match(viewer, /snapId=\{snapId\}/);

  // Social bar → comments sheet with the documented props.
  assert.match(socialBar, /import SnapCommentsSheet/);
  assert.match(socialBar, /<SnapCommentsSheet/);
  assert.match(socialBar, /snapId=\{snapId\}/);
  assert.match(socialBar, /open=\{commentsOpen\}/);
  assert.match(socialBar, /onClose=\{\(\) => setCommentsOpen\(false\)\}/);
  assert.match(socialBar, /onCommentAdded=\{handleCommentAdded\}/);

  // The Comment action opens the sheet.
  assert.match(socialBar, /aria-label="Open comments"/);
  assert.match(socialBar, /setCommentsOpen\(true\)/);
});

test("sheet is a shared component with no Telegram-specific behavior", () => {
  // Web/PWA + Telegram both reach this sheet through SnapViewer / SnapCard.
  for (const surface of [
    "components/home/RecentSnaps.tsx",
    "components/friends/SnapGallery.tsx",
    "components/telegram/TelegramMiniAppFind.tsx",
    "components/friends/SnapCard.tsx",
  ]) {
    const source = read(surface);
    assert.match(
      source,
      /SnapViewer|SnapSocialBar/,
      `${surface} uses the shared snap surface`,
    );
  }

  // No Bot messaging or Telegram branching inside the comments UI.
  assert.doesNotMatch(sheet, /\btelegram\b/i);
  assert.doesNotMatch(sheet, /\bbot\b/i);
  assert.doesNotMatch(sheet, /\/api\/telegram/);
});

// ===========================================================================
// 2. Loading / empty / error states
// ===========================================================================

test("sheet shows loading, empty, and error states", () => {
  assert.match(sheet, /Loading comments…/);
  assert.match(sheet, /No comments yet\. Be the first!/);
  assert.match(sheet, /role="alert"/);
  // Load failures surface through the error state, not a broken list.
  assert.match(sheet, /Failed to load comments/);
});

// ===========================================================================
// 3. Submit contract
// ===========================================================================

test("submit validates, prevents duplicates, and clears after success", () => {
  // Client-side guard: trimmed content and no double-send.
  assert.match(sheet, /const content = draft\.trim\(\);/);
  assert.match(sheet, /if \(!content \|\| sending\) return;/);

  // Server validation is authoritative; its message is surfaced on failure.
  assert.match(sheet, /fetch\(`\/api\/snaps\/\$\{snapId\}\/comments`, \{\s*method: "POST"/);
  assert.match(sheet, /if \(!response\.ok \|\| !result\.comment\) \{/);
  assert.match(sheet, /result\.error \?\? "Failed to post comment"/);

  // After success: list updates, input clears, count refreshes.
  assert.match(sheet, /setComments\(\(current\) => \[result\.comment!, \.\.\.current\]\)/);
  assert.match(sheet, /setDraft\(""\)/);
  assert.match(socialBar, /handleCommentAdded/);

  // Composer respects the shared server limit and disables while sending.
  assert.match(sheet, /maxLength=\{MAX_COMMENT_LENGTH\}/);
  assert.match(sheet, /import \{ MAX_COMMENT_LENGTH \} from "@\/lib\/snap-reactions"/);
  assert.match(sheet, /disabled=\{sending \|\| draft\.trim\(\)\.length === 0\}/);
});

// ===========================================================================
// 4. Pagination (consumes the C1 keyset API)
// ===========================================================================

test("sheet paginates comments with a cursor and load-more", () => {
  // Initial load stores the server cursor.
  assert.match(sheet, /const \[nextCursor, setNextCursor\] = useState<string \| null>\(null\)/);
  assert.match(sheet, /nextCursor\?: string \| null;/);
  assert.match(sheet, /setNextCursor\(result\.nextCursor \?\? null\)/);

  // Load-more requests the next keyset page and appends (newest-first order:
  // older comments go after the current ones).
  assert.match(
    sheet,
    /\/api\/snaps\/\$\{snapId\}\/comments\?cursor=\$\{encodeURIComponent\(nextCursor\)\}/,
  );
  assert.match(
    sheet,
    /setComments\(\(current\) => \[\.\.\.current, \.\.\.\(result\.comments \?\? \[\]\)\]\)/,
  );

  // Load-more affordance with its own busy state.
  assert.match(sheet, /Load more comments/);
  assert.match(sheet, /disabled=\{loadingMore\}/);
  assert.match(sheet, /if \(!nextCursor \|\| loadingMore\) return;/);
  assert.match(sheet, /\{nextCursor && !loading \? \(/);

  // No unbounded client accumulation beyond what the server returns per page.
  assert.doesNotMatch(sheet, /while\s*\(/);
});

// ===========================================================================
// 5. Existing like behavior preserved
// ===========================================================================

test("like/reaction behavior around comments is unchanged", () => {
  assert.match(socialBar, /fetch\(`\/api\/snaps\/\$\{snapId\}\/reaction`/);
  assert.match(socialBar, /Rollback optimistic update/);
  assert.match(socialBar, /<SnapReactionsSheet/);
  assert.match(socialBar, /aria-pressed=\{Boolean\(myReaction\)\}/);
});
