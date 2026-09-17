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
  type: "NEW_SNAP";
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
