"use client";

import { useEffect } from "react";
import {
  ingestPushPayload,
  markLocalNotificationRead,
} from "@/lib/local-notifications";

type SwMessage =
  | {
      type: "SNAPPY_PUSH_RECEIVED";
      notification: Record<string, unknown>;
    }
  | {
      type: "SNAPPY_NOTIFICATION_CLICK";
      notificationId: string;
      notification?: Record<string, unknown>;
    }
  | {
      type: "SNAPPY_NOTIFICATION_QUEUE";
      notifications: Record<string, unknown>[];
    };

export default function NotificationSync() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const onMessage = (event: MessageEvent<SwMessage>) => {
      const data = event.data;
      if (!data || typeof data !== "object" || !("type" in data)) {
        return;
      }

      if (data.type === "SNAPPY_PUSH_RECEIVED") {
        ingestPushPayload(data.notification);
        return;
      }

      if (data.type === "SNAPPY_NOTIFICATION_QUEUE") {
        for (const item of data.notifications) {
          ingestPushPayload(item);
        }
        return;
      }

      if (data.type === "SNAPPY_NOTIFICATION_CLICK") {
        if (data.notification) {
          ingestPushPayload(data.notification);
        }
        if (data.notificationId) {
          markLocalNotificationRead(data.notificationId);
        }
      }
    };

    navigator.serviceWorker.addEventListener("message", onMessage);

    void navigator.serviceWorker.ready.then((registration) => {
      registration.active?.postMessage({ type: "SNAPPY_SYNC_NOTIFICATIONS" });
    });

    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);

  return null;
}
