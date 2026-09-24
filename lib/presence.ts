/**
 * S7 — User Status / Presence.
 *
 * Presence is derived, never stored as a boolean. A single user-level
 * `User.lastSeenAt` timestamp is the source of truth and server time decides
 * whether a user reads as online. This keeps presence correct across
 * serverless instances, multiple tabs, and Web/PWA + Telegram simultaneously.
 */

/** A user is online while their last heartbeat is within this window. */
export const ONLINE_WINDOW_MS = 60_000;

/** Clients heartbeat at this cadence while the page is visible. */
export const HEARTBEAT_INTERVAL_MS = 30_000;

/** The server ignores heartbeat writes that are more frequent than this. */
export const HEARTBEAT_MIN_WRITE_INTERVAL_MS = 15_000;

export type PresenceSource = {
  lastSeenAt: Date | string | null | undefined;
  isActive?: boolean | null;
};

export type SerializedPresence = {
  isOnline: boolean;
  lastSeenAt: string | null;
};

function toTimestamp(value: Date | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

/**
 * Whether a user is currently online, using server-supplied time.
 *
 * - `null` lastSeenAt means offline.
 * - Exactly `ONLINE_WINDOW_MS` old still counts as online.
 * - Inactive users are always offline.
 */
export function isOnline(
  lastSeenAt: Date | string | null | undefined,
  isActive: boolean | null | undefined = true,
  now: number = Date.now(),
): boolean {
  if (isActive === false) return false;
  const timestamp = toTimestamp(lastSeenAt);
  if (timestamp === null) return false;
  return now - timestamp <= ONLINE_WINDOW_MS;
}

/** Derive the wire shape exposed through authorized chat DTOs. */
export function serializePresence(
  source: PresenceSource,
  now: number = Date.now(),
): SerializedPresence {
  const active = source.isActive !== false;
  const timestamp = active ? toTimestamp(source.lastSeenAt) : null;
  return {
    isOnline: isOnline(source.lastSeenAt, active, now),
    lastSeenAt: timestamp === null ? null : new Date(timestamp).toISOString(),
  };
}

/**
 * Human-readable last-seen label for the conversation header.
 * Returns `null` when there is no usable timestamp.
 */
export function formatLastSeen(
  lastSeenAt: Date | string | null | undefined,
  now: number = Date.now(),
): string | null {
  const timestamp = toTimestamp(lastSeenAt);
  if (timestamp === null) return null;

  const difference = Math.max(0, now - timestamp);
  const minutes = Math.floor(difference / 60_000);
  if (minutes < 1) return "Last seen just now";
  if (minutes < 60) return `Last seen ${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last seen ${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "Last seen yesterday";
  if (days < 7) return `Last seen ${days}d ago`;

  return `Last seen ${new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}
