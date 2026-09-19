import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import {
  ensureWebPushConfigured,
  isWebPushConfigured,
  webpush,
} from "@/lib/notifications/vapid";
import { sanitizeNotificationUrl } from "@/lib/notifications/internal-url";

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  notificationId: string;
  type: "NEW_SNAP" | "REACTION" | "COMMENT";
  createdAt: string;
  icon?: string;
  badge?: string;
}

function pushErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
}

async function sendPushToSubscription(
  subscription: {
    endpoint: string;
    p256dh: string;
    auth: string;
  },
  payload: PushPayload,
  subscriptionIndex: number,
): Promise<boolean> {
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    notificationId: payload.notificationId,
    type: payload.type,
    createdAt: payload.createdAt,
    icon: payload.icon ?? "/icons/icon-192x192.png",
    badge: payload.badge ?? "/icons/icon-192x192.png",
  });

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      body,
    );
    return true;
  } catch (error: unknown) {
    const statusCode =
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      typeof (error as { statusCode: number }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : null;

    if (statusCode === 404 || statusCode === 410) {
      await prisma.pushSubscription
        .delete({
          where: { endpoint: subscription.endpoint },
        })
        .catch(() => undefined);
    }

    console.error(
      `[Web Push] Delivery failed for subscription #${subscriptionIndex + 1}: status=${statusCode ?? "unknown"} message=${pushErrorMessage(error)}`,
    );
    return false;
  }
}

/** Broadcasts a new Snap push to every active push subscription. */
export async function broadcastNewSnap({
  snapId,
  profileOwnerName,
  uploaderName,
}: {
  snapId: string;
  profileOwnerName: string;
  /** Uploader username from server-side attribution (Snap.uploadedById). */
  uploaderName?: string | null;
}): Promise<void> {
  if (!isWebPushConfigured()) {
    console.warn("[Web Push] Broadcast skipped: VAPID not configured");
    return;
  }

  ensureWebPushConfigured();

  const targetPath = `/friends/${encodeURIComponent(profileOwnerName)}`;
  const targetUrl = sanitizeNotificationUrl(targetPath);
  if (!targetUrl) {
    console.error("[Web Push] Invalid target URL for snap:", snapId);
    return;
  }

  const title = "New Snap on Snappy";
  const body = uploaderName?.trim()
    ? `${uploaderName.trim()} uploaded a new Snap`
    : "A new Snap has been uploaded";

  const notificationId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const payload: PushPayload = {
    title,
    body,
    url: targetUrl,
    notificationId,
    type: "NEW_SNAP",
    createdAt,
  };

  const subscriptions = await prisma.pushSubscription.findMany();

  if (subscriptions.length === 0) {
    console.warn("[Web Push] Broadcast skipped: 0 subscriptions");
    return;
  }

  console.log(
    `[Web Push] Broadcasting new Snap to ${subscriptions.length} subscriptions`,
  );

  const results = await Promise.all(
    subscriptions.map((subscription, index) =>
      sendPushToSubscription(subscription, payload, index),
    ),
  );

  const succeeded = results.filter(Boolean).length;
  const failed = results.length - succeeded;

  console.log(
    `[Web Push] Broadcast completed: ${succeeded} succeeded, ${failed} failed`,
  );
}

/** Notifies a Snap owner when another user reacts or comments on their Snap. */
export async function notifySnapInteraction({
  snapId,
  actorId,
  type,
  body,
}: {
  snapId: string;
  /** Authenticated user who reacted/commented. */
  actorId: string;
  type: "REACTION" | "COMMENT";
  /** Comment preview for COMMENT; reaction label for REACTION. */
  body?: string | null;
}): Promise<void> {
  const snap = await prisma.snap.findUnique({
    where: { id: snapId },
    select: { userId: true },
  });

  if (!snap) {
    console.warn("[Notification] Snap not found:", snapId);
    return;
  }

  // Never notify a user about their own reaction/comment.
  if (snap.userId === actorId) {
    return;
  }

  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { name: true },
  });

  if (!actor) {
    console.warn("[Notification] Actor not found:", actorId);
    return;
  }

  const title =
    type === "REACTION"
      ? `${actor.name} reacted to your Snap`
      : `${actor.name} commented on your Snap`;

  const notificationBody =
    type === "COMMENT" && body?.trim()
      ? body.trim()
      : type === "REACTION" && body?.trim()
        ? body.trim()
        : null;

  const notification = await prisma.notification.create({
    data: {
      type,
      userId: snap.userId,
      actorId,
      snapId,
      body: notificationBody,
    },
  });

  if (!isWebPushConfigured()) {
    return;
  }

  ensureWebPushConfigured();

  const targetPath = `/notifications`;
  const targetUrl = sanitizeNotificationUrl(targetPath);
  if (!targetUrl) {
    console.error("[Web Push] Invalid target URL for notification:", notification.id);
    return;
  }

  const payload: PushPayload = {
    title,
    body: notificationBody ?? "",
    url: targetUrl,
    notificationId: notification.id,
    type,
    createdAt: notification.createdAt.toISOString(),
  };

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: snap.userId },
  });

  if (subscriptions.length === 0) {
    return;
  }

  await Promise.all(
    subscriptions.map((subscription, index) =>
      sendPushToSubscription(subscription, payload, index),
    ),
  );
}

/**
 * Send a birthday notification for the given user, but only once per day.
 * Deduplicates by checking for an existing BIRTHDAY notification for this
 * user created today (in Asia/Yangon timezone).
 */
export async function sendBirthdayNotificationIfDue({
  userId,
  username,
}: {
  userId: string;
  username: string;
}): Promise<void> {
  // Determine today's start/end in Asia/Yangon timezone for dedup query
  const now = new Date();
  const yangonToday = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Yangon" }),
  );
  const year = yangonToday.getFullYear();
  const month = yangonToday.getMonth();
  const day = yangonToday.getDate();

  // Build UTC boundaries that correspond to midnight Yangon time
  // Yangon is UTC+6:30, so midnight Yangon = 17:30 UTC previous day
  const yangonMidnight = new Date(Date.UTC(year, month, day, 0, 0, 0));
  const utcMidnight = new Date(yangonMidnight.getTime() - 6.5 * 60 * 60 * 1000);
  const utcNextMidnight = new Date(utcMidnight.getTime() + 24 * 60 * 60 * 1000);

  // Check if a BIRTHDAY notification was already sent today for this user
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: "BIRTHDAY",
      createdAt: {
        gte: utcMidnight,
        lt: utcNextMidnight,
      },
    },
    select: { id: true },
  });

  if (existing) {
    return; // Already sent today
  }

  // Create the notification record
  const notification = await prisma.notification.create({
    data: {
      type: "BIRTHDAY",
      userId,
      actorId: userId, // Self-referencing for birthday
      body: `Happy Birthday ${username}`,
    },
  });

  // Send push notification to all subscriptions (broadcast)
  if (!isWebPushConfigured()) {
    return;
  }

  ensureWebPushConfigured();

  const targetPath = "/home";
  const targetUrl = sanitizeNotificationUrl(targetPath);
  if (!targetUrl) {
    console.error("[Web Push] Invalid target URL for birthday notification");
    return;
  }

  const payload: PushPayload = {
    title: "Happy Birthday",
    body: `Happy Birthday ${username}`,
    url: targetUrl,
    notificationId: notification.id,
    type: "NEW_SNAP", // Use NEW_SNAP type for push delivery compatibility
    createdAt: notification.createdAt.toISOString(),
  };

  const subscriptions = await prisma.pushSubscription.findMany();

  if (subscriptions.length === 0) {
    return;
  }

  console.log(
    `[Web Push] Broadcasting birthday notification for ${username} to ${subscriptions.length} subscriptions`,
  );

  const results = await Promise.all(
    subscriptions.map((subscription, index) =>
      sendPushToSubscription(subscription, payload, index),
    ),
  );

  const succeeded = results.filter(Boolean).length;
  const failed = results.length - succeeded;

  console.log(
    `[Web Push] Birthday notification completed: ${succeeded} succeeded, ${failed} failed`,
  );
}
