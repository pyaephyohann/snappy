"use client";

import { getOrCreateDeviceId } from "@/lib/device-id";
export { notifyNotificationsUpdated } from "@/lib/local-notifications";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type PushSupportStatus =
  | "supported"
  | "unsupported"
  | "missing-vapid";

export function getPushSupportStatus(): PushSupportStatus {
  if (typeof window === "undefined") {
    return "unsupported";
  }
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "unsupported";
  }
  return "supported";
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

async function savePushSubscriptionToServer(
  subscription: PushSubscription,
): Promise<boolean> {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return false;
  }

  const deviceId = getOrCreateDeviceId();

  const saveResponse = await fetch("/api/notifications/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceId,
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
    }),
  });

  return saveResponse.ok;
}

/** Upserts an existing browser subscription on the server (idempotent by endpoint). */
export async function syncExistingPushSubscriptionToServer(): Promise<boolean> {
  if (getPushSupportStatus() === "unsupported") {
    return false;
  }

  if (
    typeof Notification !== "undefined" &&
    Notification.permission !== "granted"
  ) {
    return false;
  }

  try {
    const subscription = await getExistingSubscription();
    if (!subscription) {
      return false;
    }

    const saved = await savePushSubscriptionToServer(subscription);
    if (!saved) {
      console.error(
        "[Web Push] Failed to sync existing subscription with the server.",
      );
    }
    return saved;
  } catch (error) {
    console.error("[Web Push] Subscription sync error:", error);
    return false;
  }
}

export async function subscribeToWebPush(): Promise<
  "granted" | "denied" | "default" | "error" | "missing-vapid"
> {
  if (getPushSupportStatus() === "unsupported") {
    return "error";
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return permission;
  }

  const vapidResponse = await fetch("/api/notifications/vapid-public-key");
  if (!vapidResponse.ok) {
    return "missing-vapid";
  }
  const { publicKey } = (await vapidResponse.json()) as { publicKey: string };

  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
  });
  await navigator.serviceWorker.ready;

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(
      publicKey,
    ) as unknown as BufferSource,
  });

  const saved = await savePushSubscriptionToServer(subscription);
  if (!saved) {
    return "error";
  }

  return "granted";
}

export async function unsubscribeFromWebPush(): Promise<boolean> {
  const subscription = await getExistingSubscription();
  if (!subscription) {
    return true;
  }

  const endpoint = subscription.endpoint;

  await fetch("/api/notifications/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });

  await subscription.unsubscribe();
  return true;
}
