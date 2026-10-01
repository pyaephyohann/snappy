/**
 * N3 — Notification Grouping (presentation layer only).
 *
 * Audit finding: the list API already returns a flat newest-first page and
 * the shared NotificationsPageClient never paginates (it reloads and replaces
 * its loaded list), so grouping can be a pure client-side fold over whatever
 * is loaded — Option A. No NotificationGroup model, no migration, no API
 * change, no synthetic rows: every underlying Notification stays individually
 * addressable and the N2 server unread count keeps counting rows, not groups.
 *
 * This suite locks:
 * - the grouping keys (REACTION same snap + same emoji; COMMENT same snap;
 *   FOLLOW type-only; FOLLOW never merges with FOLLOW_ACCEPTED; messages,
 *   birthdays and new-Snaps stay individual)
 * - the lossless invariant (every loaded notification appears exactly once)
 * - read state (group unread while any member is unread, no readAt mutation)
 * - ordering (groups follow their newest underlying notification)
 * - the page-boundary rule (grouping only claims what has been loaded)
 * - the client wiring (shared Web + Telegram rendering, batched mark-read
 *   through the existing per-notification API, no server-side grouping)
 *
 * Run: node --env-file-if-exists=.env.local --import tsx --test scripts/notification-grouping.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  groupNotifications,
  type GroupableNotification,
  type NotificationGroup,
} from "../lib/notifications/notification-grouping";

const root = resolve(import.meta.dirname, "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const helper = read("lib/notifications/notification-grouping.ts");
const client = read("components/notifications/NotificationsPageClient.tsx");
const listRoute = read("app/api/notifications/route.ts");
const schema = read("prisma/schema.prisma");

let nextId = 0;
function notification(
  overrides: Partial<GroupableNotification> = {},
): GroupableNotification {
  nextId += 1;
  return {
    id: `n${nextId}`,
    type: "REACTION",
    actor: { name: "Ada" },
    snapId: "snap1",
    body: "❤️",
    read: true,
    createdAt: "2026-10-02T10:00:00.000Z",
    ...overrides,
  };
}

function flattenIds(groups: NotificationGroup[]): string[] {
  return groups.flatMap((group) => group.notifications.map((n) => n.id));
}

// ===========================================================================
// 1. Grouping keys
// ===========================================================================

test("an empty feed produces no groups", () => {
  assert.deepEqual(groupNotifications([]), []);
});

test("compatible notifications collapse into one group", () => {
  const groups = groupNotifications([
    notification({ id: "a", actor: { name: "Ada" } }),
    notification({ id: "b", actor: { name: "Basil" } }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].type, "REACTION");
  assert.equal(groups[0].notifications.length, 2);
  assert.equal(groups[0].actorCount, 2);
});

test("reactions to different snaps stay separate", () => {
  const groups = groupNotifications([
    notification({ snapId: "snapX" }),
    notification({ snapId: "snapY" }),
  ]);
  assert.equal(groups.length, 2);
});

test("reactions and comments on the same snap stay separate", () => {
  const groups = groupNotifications([
    notification({ type: "REACTION" }),
    notification({
      type: "COMMENT",
      body: "love this",
    }),
  ]);
  assert.equal(groups.length, 2);
});

test("different reaction emojis on the same snap stay separate", () => {
  // REACTION bodies hold the emoji itself; one body line cannot describe a
  // mixed ❤️/😂 group, so truthfulness wins over compression.
  const groups = groupNotifications([
    notification({ actor: { name: "Ada" }, body: "❤️" }),
    notification({ actor: { name: "Basil" }, body: "😂" }),
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((g) => g.primaryNotification.body).sort(),
    ["❤️", "😂"],
  );
});

test("follows group by type and never merge with acceptances", () => {
  const groups = groupNotifications([
    notification({ type: "FOLLOW", actor: { name: "Ada" }, snapId: null }),
    notification({ type: "FOLLOW", actor: { name: "Basil" }, snapId: null }),
    notification({ type: "FOLLOW", actor: { name: "Cleo" }, snapId: null }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].type, "FOLLOW");
  assert.equal(groups[0].actorCount, 3);

  const mixed = groupNotifications([
    notification({ type: "FOLLOW", actor: { name: "Ada" }, snapId: null }),
    notification({
      type: "FOLLOW_ACCEPTED",
      actor: { name: "Basil" },
      snapId: null,
    }),
  ]);
  assert.equal(mixed.length, 2);
  assert.deepEqual(mixed.map((g) => g.type), ["FOLLOW", "FOLLOW_ACCEPTED"]);
});

test("messages and birthdays stay individual", () => {
  const groups = groupNotifications([
    notification({ type: "NEW_MESSAGE", actor: { name: "Ada" }, snapId: null }),
    notification({
      type: "NEW_MESSAGE",
      actor: { name: "Ada" },
      snapId: null,
    }),
    notification({ type: "BIRTHDAY", actor: { name: "Basil" }, snapId: null }),
  ]);
  assert.equal(groups.length, 3);
  assert.ok(groups.every((g) => g.notifications.length === 1));
});

// ===========================================================================
// 2. Read state (no mutation, any-unread semantics)
// ===========================================================================

test("a group is unread while any underlying notification is unread", () => {
  const allRead = groupNotifications([
    notification({ read: true }),
    notification({ read: true }),
  ]);
  assert.equal(allRead[0].unreadCount, 0);

  const oneUnread = groupNotifications([
    notification({ read: true }),
    notification({ read: false }),
  ]);
  assert.equal(oneUnread[0].unreadCount, 1);

  const allUnread = groupNotifications([
    notification({ read: false }),
    notification({ read: false }),
  ]);
  assert.equal(allUnread[0].unreadCount, 2);
});

test("grouping never mutates the input or its read flags", () => {
  const input = [
    notification({ read: false }),
    notification({ read: true, createdAt: "2026-10-02T09:00:00.000Z" }),
  ];
  const snapshot = structuredClone(input);
  const groups = groupNotifications(input);

  assert.deepEqual(input, snapshot);
  // Groups reference the same items — presentation only, no copies needed.
  assert.equal(groups[0].notifications[0], input[0]);
  assert.equal(groups[0].notifications[1], input[1]);
});

// ===========================================================================
// 3. Lossless invariant
// ===========================================================================

test("grouping is lossless across a mixed feed", () => {
  const input = [
    notification({ type: "REACTION", actor: { name: "Ada" } }),
    notification({ type: "REACTION", actor: { name: "Basil" } }),
    notification({ type: "COMMENT", body: "nice", actor: { name: "Cleo" } }),
    notification({ type: "FOLLOW", snapId: null, actor: { name: "Dora" } }),
    notification({
      type: "FOLLOW_ACCEPTED",
      snapId: null,
      actor: { name: "Eli" },
    }),
    notification({
      type: "NEW_MESSAGE",
      snapId: null,
      actor: { name: "Fay" },
    }),
    notification({ type: "BIRTHDAY", snapId: null, actor: { name: "Gus" } }),
    notification({ type: "NEW_SNAP", snapId: null, actor: { name: "Hal" } }),
  ];
  const groups = groupNotifications(input);

  const ids = flattenIds(groups);
  assert.equal(ids.length, input.length);
  assert.equal(new Set(ids).size, input.length);
  assert.deepEqual([...ids].sort(), input.map((n) => n.id).sort());
});

// ===========================================================================
// 4. Ordering and primary selection
// ===========================================================================

test("groups order by their newest underlying notification", () => {
  const newest = notification({
    id: "x1",
    snapId: "snapX",
    createdAt: "2026-10-02T10:00:00.000Z",
  });
  const other = notification({
    id: "y1",
    snapId: "snapY",
    type: "COMMENT",
    body: "hi",
    createdAt: "2026-10-02T09:00:00.000Z",
  });
  const oldest = notification({
    id: "x2",
    snapId: "snapX",
    actor: { name: "Basil" },
    createdAt: "2026-10-02T08:00:00.000Z",
  });

  const groups = groupNotifications([newest, other, oldest]);
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((g) => g.primaryNotification.id),
    ["x1", "y1"],
  );
  assert.equal(groups[0].primaryNotification, newest);
});

test("identical timestamps keep first-seen group order", () => {
  const a = notification({ id: "a", snapId: "snapA" });
  const b = notification({
    id: "b",
    snapId: "snapB",
    createdAt: "2026-10-02T10:00:00.000Z",
  });
  const groups = groupNotifications([a, b]);
  assert.deepEqual(
    groups.map((g) => g.primaryNotification.id),
    ["a", "b"],
  );
});

// ===========================================================================
// 5. Page boundary (Option A — group only what is loaded)
// ===========================================================================

test("appending a page regroups losslessly without claiming unloaded data", () => {
  const page1 = [
    notification({ id: "p1", snapId: "snapX", actor: { name: "Ada" } }),
    notification({
      id: "p2",
      snapId: "snapY",
      type: "COMMENT",
      body: "hi",
      actor: { name: "Basil" },
      createdAt: "2026-10-02T09:00:00.000Z",
    }),
  ];
  const page2 = [
    notification({
      id: "p3",
      snapId: "snapX",
      actor: { name: "Cleo" },
      createdAt: "2026-10-02T08:00:00.000Z",
    }),
    notification({
      id: "p4",
      snapId: "snapZ",
      actor: { name: "Dora" },
      createdAt: "2026-10-02T07:00:00.000Z",
    }),
  ];

  // Page 1 alone: only one reaction for snapX is known, so the group stays
  // single-member — no pretending the full group is visible.
  const page1Groups = groupNotifications(page1);
  const snapXAlone = page1Groups.find((g) => g.type === "REACTION");
  assert.ok(snapXAlone);
  assert.equal(snapXAlone.notifications.length, 1);

  // After page 2 loads, the client recomputes from the complete loaded list.
  const combined = groupNotifications([...page1, ...page2]);
  const combinedSnapX = combined.find((g) => g.type === "REACTION");
  assert.ok(combinedSnapX);
  assert.equal(combinedSnapX.notifications.length, 2);
  const ids = flattenIds(combined);
  assert.equal(ids.length, page1.length + page2.length);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual([...ids].sort(), [...page1, ...page2].map((n) => n.id).sort());
});

// ===========================================================================
// 6. Client wiring (shared Web + Telegram presentation)
// ===========================================================================

test("the shared client groups its loaded list client-side", () => {
  // Grouping is a pure helper with zero imports — no React, no Prisma.
  assert.doesNotMatch(helper, /^import /m);

  // The client recomputes groups from whatever is loaded (Option A) and never
  // paginates beyond what the API returned.
  assert.match(
    client,
    /import \{\s*groupNotifications,\s*type NotificationGroup,\s*\} from "@\/lib\/notifications\/notification-grouping";/,
  );
  assert.match(client, /const groups = useMemo\(\(\) => groupNotifications\(items\), \[items\]\);/);

  // No server-side grouping: the list API and schema stay untouched.
  assert.doesNotMatch(listRoute, /group/i);
  assert.doesNotMatch(schema, /NotificationGroup/);
});

test("single notifications keep the existing row behavior", () => {
  assert.match(client, /const unread = !item\.read;/);
  assert.match(client, /Single notifications keep the exact existing row behavior/);
  assert.match(client, /title=\{notificationTitle\(item\)\}/);
});

test("group rows are truthful, unread-aware, and share one destination", () => {
  // Read state: any underlying unread makes the group unread.
  assert.match(client, /const unread = group\.unreadCount > 0;/);
  // Actor compression stays truthful and per-type.
  assert.match(client, /const GROUP_VERB: Record<NotificationItem\["type"\], string> = \{/);
  assert.match(client, /1 other/);
  assert.match(client, /\$\{others\} others/);
  // The group routes through the primary notification's existing target.
  assert.match(
    client,
    /router\.push\(targetUrl\(group\.primaryNotification, miniAppPrefix\)\);/,
  );
});

test("marking a group read reuses the per-notification API and refreshes the badge once", () => {
  assert.match(client, /const handleOpenGroup = \(group: NotificationGroup<NotificationItem>\) => \{/);
  // One PATCH per unread member — the existing per-notification endpoint.
  assert.match(
    client,
    /unreadMembers\.map\(\(item\) =>\s*fetch\(`\/api\/notifications\/\$\{item\.id\}\/read`/,
  );
  // A single badge refresh after a confirmed mutation; the server count
  // still reflects underlying rows, never visual groups.
  assert.match(client, /responses\.some\(\(res\) => res\.ok\)/);
  assert.match(client, /notifyNotificationsUpdated\(\);/);
  // The badge is never decremented client-side (N2 invariant).
  assert.doesNotMatch(client, /unreadCount\s*[-+]=|count\s*-\s*1/);
});

test("Telegram reuses the same grouped client", () => {
  const alerts = read("components/telegram/TelegramMiniAppAlerts.tsx");
  assert.match(alerts, /NotificationsPageClient/);
  assert.match(alerts, /miniAppPrefix="\/telegram\/app"/);
});
