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

async function sendPushToSubscription(
  subscription: {
    endpoint: string;
    p256dh: string;
    auth: string;
  },
  payload: PushPayload,
): Promise<void> {
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
    } else {
      console.error("[Web Push] Delivery failed:", error);
    }
  }
}

/** Broadcasts a new Snap push to every active push subscription. */
export async function broadcastNewSnap({
  snapId,
  profileOwnerName,
}: {
  snapId: string;
  profileOwnerName: string;
}): Promise<void> {
  if (!isWebPushConfigured()) {
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
  const body = `A new Snap has been uploaded.`;

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
    return;
  }

  await Promise.all(
    subscriptions.map((subscription) =>
      sendPushToSubscription(subscription, payload),
    ),
  );
}
