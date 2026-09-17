import type { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ensureWebPushConfigured,
  isWebPushConfigured,
  webpush,
} from "@/lib/notifications/vapid";
import { sanitizeNotificationUrl } from "@/lib/notifications/internal-url";

export interface CreateNotificationInput {
  recipientUserId: string;
  type: NotificationType;
  title: string;
  body: string;
  targetUrl: string;
  relatedUserId?: string | null;
  relatedSnapId?: string | null;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  notificationId: string;
  icon?: string;
  badge?: string;
}

export async function createNotificationRecord(input: CreateNotificationInput) {
  const targetUrl = sanitizeNotificationUrl(input.targetUrl);
  if (!targetUrl) {
    throw new Error("Invalid notification target URL");
  }

  return prisma.notification.create({
    data: {
      recipientUserId: input.recipientUserId,
      type: input.type,
      title: input.title,
      body: input.body,
      targetUrl,
      relatedUserId: input.relatedUserId ?? null,
      relatedSnapId: input.relatedSnapId ?? null,
    },
  });
}

export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  if (!isWebPushConfigured()) {
    return;
  }

  ensureWebPushConfigured();

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  if (subscriptions.length === 0) {
    return;
  }

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    notificationId: payload.notificationId,
    icon: payload.icon ?? "/icons/icon-192x192.png",
    badge: payload.badge ?? "/icons/icon-192x192.png",
  });

  await Promise.all(
    subscriptions.map(async (subscription) => {
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
          await prisma.pushSubscription.delete({
            where: { endpoint: subscription.endpoint },
          }).catch(() => undefined);
        } else {
          console.error("[Web Push] Delivery failed:", error);
        }
      }
    }),
  );
}

/** Creates DB notification and attempts push delivery (push failures are non-fatal). */
export async function createNotificationAndPush(
  input: CreateNotificationInput,
): Promise<void> {
  const notification = await createNotificationRecord(input);

  try {
    await sendPushToUser(input.recipientUserId, {
      title: notification.title,
      body: notification.body,
      url: notification.targetUrl,
      notificationId: notification.id,
    });
  } catch (error) {
    console.error("[Web Push] sendPushToUser failed:", error);
  }
}

export async function notifyNewSnap({
  recipientUserId,
  actorUserId,
  actorName,
  profileOwnerName,
  snapId,
}: {
  recipientUserId: string;
  actorUserId: string;
  actorName: string;
  profileOwnerName: string;
  snapId: string;
}): Promise<void> {
  if (recipientUserId === actorUserId) {
    return;
  }

  const targetUrl = `/friends/${encodeURIComponent(profileOwnerName)}`;
  const title = `New Snap from ${actorName}`;
  const body = `${actorName} sent you a new Snap.`;

  await createNotificationAndPush({
    recipientUserId,
    type: "NEW_SNAP",
    title,
    body,
    targetUrl,
    relatedUserId: actorUserId,
    relatedSnapId: snapId,
  });
}
