"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { NOTIFICATIONS_UPDATED_EVENT } from "@/lib/local-notifications";

type NotificationItem = {
  id: string;
  type: "NEW_SNAP" | "REACTION" | "COMMENT";
  actor: { name: string; image: string };
  snapId: string | null;
  snapOwnerName: string | null;
  body: string | null;
  read: boolean;
  createdAt: string;
};

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

function notificationTitle(item: NotificationItem): string {
  if (item.type === "REACTION") {
    return `${item.actor.name} reacted to your Snap`;
  }
  if (item.type === "COMMENT") {
    return `${item.actor.name} commented on your Snap`;
  }
  return item.body ?? "A new Snap has been uploaded";
}

function notificationBody(item: NotificationItem): string | null {
  if (item.type === "REACTION" || item.type === "COMMENT") {
    return item.body;
  }
  return null;
}

function targetUrl(item: NotificationItem, miniAppPrefix?: string): string {
  if (item.snapOwnerName) {
    const path = `/friends/${encodeURIComponent(item.snapOwnerName)}`;
    return miniAppPrefix ? `${miniAppPrefix}${path}` : path;
  }
  return miniAppPrefix ? `${miniAppPrefix}/alerts` : "/notifications";
}

export default function NotificationsPageClient({
  miniAppPrefix,
}: {
  miniAppPrefix?: string;
} = {}) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) {
        setError("Could not load notifications.");
        return;
      }
      const data = (await res.json()) as {
        notifications: NotificationItem[];
      };
      setItems(data.notifications);
      setError(null);
    } catch {
      setError("Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void reload(), 0);
    const onUpdated = () => void reload();
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, onUpdated);
    window.addEventListener("focus", onUpdated);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, onUpdated);
      window.removeEventListener("focus", onUpdated);
    };
  }, [reload]);

  const handleOpen = (item: NotificationItem) => {
    if (!item.read) {
      setItems((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)),
      );
      void fetch(`/api/notifications/${item.id}/read`, {
        method: "PATCH",
      }).catch(() => undefined);
    }
    router.push(targetUrl(item, miniAppPrefix));
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground sm:text-base">
          Loading notifications…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-border bg-card px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground sm:text-base">{error}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground sm:text-base">
          You&apos;re all caught up. New Snaps will show up here.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {items.map((item) => {
        const unread = !item.read;
        const body = notificationBody(item);
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
                    unread
                      ? "font-semibold text-foreground"
                      : "font-medium text-foreground"
                  }`}
                >
                  {notificationTitle(item)}
                </span>
                {body ? (
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {body}
                  </span>
                ) : null}
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
