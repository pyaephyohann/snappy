"use client";

export const LOCAL_NOTIFICATIONS_KEY = "snappy:notifications";
export const NOTIFICATIONS_UPDATED_EVENT = "snappy:notifications-updated";

export type LocalNotificationType = "NEW_SNAP" | "REACTION" | "COMMENT";

export interface LocalNotification {
  id: string;
  type: LocalNotificationType;
  title: string;
  body: string;
  targetUrl: string;
  createdAt: string;
  readAt: string | null;
}

export interface PushNotificationPayload {
  id: string;
  type: LocalNotificationType;
  title: string;
  body: string;
  targetUrl: string;
  createdAt: string;
}

function readStore(): LocalNotification[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = localStorage.getItem(LOCAL_NOTIFICATIONS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isLocalNotification);
  } catch {
    return [];
  }
}

function writeStore(items: LocalNotification[]): void {
  try {
    localStorage.setItem(LOCAL_NOTIFICATIONS_KEY, JSON.stringify(items));
  } catch {
    /* quota / private mode */
  }
}

const LOCAL_NOTIFICATION_TYPES: LocalNotificationType[] = [
  "NEW_SNAP",
  "REACTION",
  "COMMENT",
];

function isLocalNotification(value: unknown): value is LocalNotification {
  if (!value || typeof value !== "object") {
    return false;
  }
  const n = value as Record<string, unknown>;
  return (
    typeof n.id === "string" &&
    typeof n.type === "string" &&
    (LOCAL_NOTIFICATION_TYPES as string[]).includes(n.type) &&
    typeof n.title === "string" &&
    typeof n.body === "string" &&
    typeof n.targetUrl === "string" &&
    typeof n.createdAt === "string" &&
    (n.readAt === null || typeof n.readAt === "string")
  );
}

export function notifyNotificationsUpdated(): void {
  window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT));
}

export function listLocalNotifications(): LocalNotification[] {
  return readStore().sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function getUnreadLocalNotificationCount(): number {
  return readStore().filter((n) => !n.readAt).length;
}

export function upsertLocalNotification(
  payload: PushNotificationPayload,
): LocalNotification {
  const items = readStore();
  const existingIndex = items.findIndex((n) => n.id === payload.id);
  const record: LocalNotification = {
    id: payload.id,
    type: payload.type,
    title: payload.title,
    body: payload.body,
    targetUrl: payload.targetUrl,
    createdAt: payload.createdAt,
    readAt: existingIndex >= 0 ? items[existingIndex].readAt : null,
  };

  if (existingIndex >= 0) {
    items[existingIndex] = record;
  } else {
    items.unshift(record);
  }

  const trimmed = items.slice(0, 200);
  writeStore(trimmed);
  notifyNotificationsUpdated();
  return record;
}

export function markLocalNotificationRead(id: string): void {
  const items = readStore();
  const index = items.findIndex((n) => n.id === id);
  if (index < 0) {
    return;
  }
  if (items[index].readAt) {
    return;
  }
  items[index] = {
    ...items[index],
    readAt: new Date().toISOString(),
  };
  writeStore(items);
  notifyNotificationsUpdated();
}

export function ingestPushPayload(data: {
  notificationId?: string;
  id?: string;
  type?: string;
  title?: string;
  body?: string;
  url?: string;
  targetUrl?: string;
  createdAt?: string;
}): LocalNotification | null {
  const id =
    typeof data.notificationId === "string"
      ? data.notificationId
      : typeof data.id === "string"
        ? data.id
        : null;
  if (!id) {
    return null;
  }

  const rawType = typeof data.type === "string" ? data.type : "NEW_SNAP";
  const type = (LOCAL_NOTIFICATION_TYPES as string[]).includes(rawType)
    ? (rawType as LocalNotificationType)
    : "NEW_SNAP";
  const title =
    typeof data.title === "string" ? data.title : "New Snap on Snappy";
  const body =
    typeof data.body === "string" ? data.body : "A new Snap has been uploaded.";
  const targetUrl =
    typeof data.targetUrl === "string"
      ? data.targetUrl
      : typeof data.url === "string"
        ? data.url
        : "/notifications";
  const createdAt =
    typeof data.createdAt === "string"
      ? data.createdAt
      : new Date().toISOString();

  return upsertLocalNotification({
    id,
    type,
    title,
    body,
    targetUrl,
    createdAt,
  });
}
