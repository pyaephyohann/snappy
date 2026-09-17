"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { notifyNotificationsUpdated } from "@/lib/push-client";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  targetUrl: string;
  createdAt: string;
}

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
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/notifications");
        if (!response.ok) {
          throw new Error("Failed to load notifications");
        }
        const data = (await response.json()) as {
          notifications: NotificationItem[];
        };
        if (!cancelled) {
          setItems(data.notifications ?? []);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError("Could not load notifications. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const markRead = async (id: string) => {
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, readAt: new Date().toISOString() } : item,
      ),
    );
    notifyNotificationsUpdated();
  };

  const handleOpen = async (item: NotificationItem) => {
    if (!item.readAt) {
      await markRead(item.id);
    }
    router.push(item.targetUrl);
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">Loading notifications…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-border bg-card px-6 py-12 text-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground sm:text-base">
          You&apos;re all caught up. New activity will show up here.
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
              onClick={() => void handleOpen(item)}
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
