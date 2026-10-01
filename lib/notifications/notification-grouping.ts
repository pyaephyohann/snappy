/**
 * N3 — presentation-layer notification grouping.
 *
 * Grouping is a display concern only: the database keeps one Notification row
 * per event and `GET /api/notifications` keeps returning the flat, newest-first
 * list. This helper folds that loaded list into visual groups without touching
 * the rows themselves.
 *
 * Invariants (locked by scripts/notification-grouping.test.ts):
 * - Lossless: every input notification lands in exactly one group, so
 *   sum(group.notifications.length) === notifications.length — no dropped,
 *   duplicated, or synthetic records.
 * - Read-only: the input array and its items are never mutated; `read` flags
 *   are consumed as-is and marking rows read stays the caller's job through
 *   the existing per-notification API.
 * - Deterministic: same input, same groups. Group order follows the newest
 *   underlying notification (the API is newest-first); ties keep first-seen
 *   order.
 * - Truthful: a group only merges notifications that share the meaning its
 *   single title/body line can represent. Reactions with different emoji
 *   (body) never merge, because one body line cannot describe both.
 *
 * Pure TypeScript: no React, no Prisma, no side effects. Timestamps are the
 * ISO strings produced by the list API, so ordering compares them as strings.
 */

export type GroupableNotificationType =
  | "NEW_SNAP"
  | "NEW_MESSAGE"
  | "REACTION"
  | "COMMENT"
  | "BIRTHDAY"
  | "FOLLOW"
  | "FOLLOW_ACCEPTED";

/** Structural subset of the list-API payload the grouping rules read. */
export type GroupableNotification = {
  id: string;
  type: GroupableNotificationType;
  actor: { name: string };
  snapId: string | null;
  body: string | null;
  read: boolean;
  /** ISO timestamp from the list API (newest-first ordering upstream). */
  createdAt: string;
};

/**
 * A presentation group. `notifications` holds the full underlying items
 * (same references as the input), so no payload data is duplicated or lost.
 */
export type NotificationGroup<
  T extends GroupableNotification = GroupableNotification,
> = {
  key: string;
  type: T["type"];
  notifications: T[];
  /** Newest member — the group's displayed actor, body, and destination. */
  primaryNotification: T;
  /** Distinct actor names in the group. */
  actorCount: number;
  /** How many underlying notifications are still unread. */
  unreadCount: number;
};

/**
 * Grouping key per type. Every notification gets a key, so ungroupable types
 * simply form single-item groups and the lossless invariant holds by
 * construction.
 *
 * - REACTION: same Snap AND same emoji (body). Reaction bodies hold the emoji
 *   itself; merging a ❤️ with a 😂 would let one body line misrepresent the
 *   reactions, so the emoji is part of the key.
 * - COMMENT: same Snap. The group shows the newest comment preview; each
 *   comment remains an individual row in the database.
 * - FOLLOW: type alone. Every follow targets the recipient ("you"), so the
 *   type is the target. FOLLOW_ACCEPTED is a different event and keeps its
 *   own key — the two never merge.
 * - NEW_MESSAGE (per-conversation, per-sender previews), BIRTHDAY (distinct
 *   per-person targets) and NEW_SNAP (broadcast, no rows) stay individual:
 *   one group per notification, keyed by id.
 */
function groupKey(item: GroupableNotification): string {
  switch (item.type) {
    case "REACTION":
      return `REACTION:${item.snapId ?? "none"}:${item.body ?? "none"}`;
    case "COMMENT":
      return `COMMENT:${item.snapId ?? "none"}`;
    case "FOLLOW":
      return "FOLLOW";
    case "FOLLOW_ACCEPTED":
      return "FOLLOW_ACCEPTED";
    default:
      return `${item.type}:${item.id}`;
  }
}

/**
 * Fold a loaded notifications list into presentation groups.
 *
 * @param notifications — the loaded list as returned by the API
 *   (newest-first; unsorted input still yields deterministic output).
 */
export function groupNotifications<T extends GroupableNotification>(
  notifications: T[],
): NotificationGroup<T>[] {
  const byKey = new Map<string, NotificationGroup<T>>();
  const insertionOrder: NotificationGroup<T>[] = [];

  for (const item of notifications) {
    const key = groupKey(item);
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        type: item.type,
        notifications: [],
        primaryNotification: item,
        actorCount: 0,
        unreadCount: 0,
      };
      byKey.set(key, group);
      insertionOrder.push(group);
    }
    group.notifications.push(item);
    // The newest member represents the group. Strict comparison keeps the
    // earlier-seen member on identical timestamps (deterministic tie-break).
    if (item.createdAt > group.primaryNotification.createdAt) {
      group.primaryNotification = item;
    }
  }

  return insertionOrder
    .map((group) => ({
      ...group,
      actorCount: new Set(group.notifications.map((n) => n.actor.name)).size,
      unreadCount: group.notifications.reduce(
        (count, member) => (member.read ? count : count + 1),
        0,
      ),
    }))
    // Groups surface in feed order: newest underlying notification first.
    // Array#sort is stable, so identical timestamps keep first-seen order.
    .sort((a, b) =>
      b.primaryNotification.createdAt.localeCompare(
        a.primaryNotification.createdAt,
      ),
    );
}
