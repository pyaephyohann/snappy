"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listLocalNotifications,
  markLocalNotificationRead,
  NOTIFICATIONS_UPDATED_EVENT,
  type LocalNotification,
} from "@/lib/local-notifications";

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString();
}

export default function NotificationsPageClient() {
  const router = useRouter();
  const [items, setItems] = useState<LocalNotification[]>(() =>
    listLocalNotifications(),
  );

  const reload = useCallback(() => {
    setItems(listLocalNotifications());
  }, []);

  useEffect(() => {
    const onUpdated = () => reload();
    const onStorage = (event: StorageEvent) => {
      if (event.key === "snappy:notifications" || event.key === null) {
        reload();
      }
    };

    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, onUpdated);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onUpdated);

    return () => {
      window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, onUpdated);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onUpdated);
    };
  }, [reload]);

  const handleOpen = (item: LocalNotification) => {
    if (!item.readAt) {
      markLocalNotificationRead(item.id);
      setItems(listLocalNotifications());
    }
    router.push(item.targetUrl);
  };

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground sm:text-base">
          You&apos;re all caught up. New Snaps will show up here on this device.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {items.map((item) => {
        const unread = !item.readAt;
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => handleOpen(item)}
              className={`flex w-full cursor-pointer gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
                unread ? "bg-primary/5" : ""
              }`}
            >
              <span
                className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                  unread ? "bg-primary" : "bg-muted-foreground/40"
                }`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-sm ${
                    unread ? "font-semibold text-foreground" : "font-medium text-foreground"
                  }`}
                >
                  {item.title}
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  {item.body}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {formatRelativeTime(item.createdAt)}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
