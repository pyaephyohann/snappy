/**
 * C5 — Notification UI / integration for like + comment alerts.
 *
 * Audit finding: the notification UI is complete and generic — the existing
 * NotificationsPageClient already renders REACTION and COMMENT records with
 * actor titles, comment previews, snap-owner links, and read state, and both
 * the Web /notifications page and the Telegram Mini App alerts screen reuse
 * that one component. No new notification screen or architecture is added.
 *
 * This milestone locks that contract:
 * - like/comment rows render in the existing list (no separate screen)
 * - comment body preview is shown
 * - rows link to the Snap surface via the existing snapOwnerName routing
 * - unread state uses Notification.readAt (independent of chat read state)
 * - Telegram reuses the shared client with its prefix (no Bot delivery)
 *
 * Run: node --env-file-if-exists=.env.local --import tsx --test scripts/snap-notification-ui.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const client = read("components/notifications/NotificationsPageClient.tsx");
const page = read("app/notifications/page.tsx");

// ===========================================================================
// 1. Like + comment rows render in the existing list
// ===========================================================================

test("the existing notification client renders like and comment rows", () => {
  // Generic client — no new notification screen was introduced.
  assert.match(page, /NotificationsPageClient/);
  assert.match(client, /type: "NEW_SNAP" \| "NEW_MESSAGE" \| "REACTION" \| "COMMENT" \| "BIRTHDAY" \| "FOLLOW"/);

  // Titles for the two social types.
  assert.match(client, /`?\$\{item\.actor\.name\} reacted to your Snap`?/);
  assert.match(client, /`?\$\{item\.actor\.name\} commented on your Snap`?/);

  // Comment preview renders as the row body.
  assert.match(client, /if \(item\.type === "REACTION" \|\| item\.type === "COMMENT"\) \{\s*return item\.body;/);
});

// ===========================================================================
// 2. Rows link to the Snap surface
// ===========================================================================

test("like and comment rows route to the Snap owner surface", () => {
  // Existing routing convention: rows without conversation routing go to
  // the Snap owner page (/friends/<name>), where the Snap lives.
  assert.match(client, /if \(item\.snapOwnerName\) \{/);
  assert.match(client, /`\/friends\/\$\{encodeURIComponent\(item\.snapOwnerName\)\}`/);
  // No chat routing leaks into social rows (conversationId only for messages).
  assert.match(client, /if \(item\.type === "NEW_MESSAGE" && item\.conversationId\) \{/);
});

// ===========================================================================
// 3. Read state stays on Notification.readAt
// ===========================================================================

test("social rows use Notification.readAt — chat read state untouched", () => {
  // The client only ever consumes the mapped boolean `read` flag — it
  // never touches Chat.lastReadAt or raw readAt values.
  assert.match(client, /if \(!item\.read\) \{/);
  assert.match(client, /const unread = !item\.read;/);
  assert.doesNotMatch(client, /lastReadAt/);
  assert.match(client, /\/api\/notifications\/\$\{item\.id\}\/read/);

  // The list API derives `read` from readAt only.
  const listRoute = read("app/api/notifications/route.ts");
  assert.match(listRoute, /read: n\.readAt !== null/);
  assert.doesNotMatch(listRoute, /lastReadAt/);

  // Chat read behavior is independent (and remains so).
  const chatRead = read("app/api/chats/[conversationId]/read/route.ts");
  assert.match(chatRead, /lastReadAt/);
  assert.doesNotMatch(chatRead, /notification/);
});

// ===========================================================================
// 4. List stays bounded + Telegram reuse
// ===========================================================================

test("notification list stays cursor-paginated and Telegram reuses the client", () => {
  const listRoute = read("app/api/notifications/route.ts");
  assert.match(listRoute, /const PAGE_SIZE = 30;/);
  assert.match(listRoute, /take: PAGE_SIZE \+ 1,/);
  assert.match(listRoute, /const nextCursor = hasMore \? page\[page\.length - 1\]\.id : null/);

  // Telegram alerts wrap the same component — no separate notification
  // architecture and no Bot delivery.
  const alerts = read("components/telegram/TelegramMiniAppAlerts.tsx");
  assert.match(alerts, /NotificationsPageClient/);
  assert.match(alerts, /miniAppPrefix="\/telegram\/app"/);
  assert.doesNotMatch(alerts, /sendMessage|bot/i);
});
