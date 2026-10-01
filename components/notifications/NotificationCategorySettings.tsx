"use client";

import { useEffect, useState } from "react";
import type {
  NotificationPushCategory,
  NotificationPushPreferences,
} from "@/lib/notifications/notification-preferences";

type CategoryCopy = {
  key: NotificationPushCategory;
  label: string;
  description: string;
};

const CATEGORIES: CategoryCopy[] = [
  {
    key: "reaction",
    label: "Reactions",
    description: "Get notified when someone reacts to your Snap",
  },
  {
    key: "comment",
    label: "Comments",
    description: "Get notified when someone comments on your Snap",
  },
  {
    key: "follow",
    label: "Follows",
    description: "Get notified when someone follows you",
  },
  {
    key: "followAccepted",
    label: "Follow accepted",
    description: "Get notified when someone accepts your follow",
  },
  {
    key: "message",
    label: "Messages",
    description: "Get notified when you receive a message",
  },
  {
    key: "birthday",
    label: "Birthdays",
    description: "Get birthday notifications",
  },
  {
    key: "newSnap",
    label: "New Snaps",
    description: "Get notified when a new Snap is uploaded",
  },
];

export default function NotificationCategorySettings() {
  const [preferences, setPreferences] =
    useState<NotificationPushPreferences | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/notifications/preferences", {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error("request failed");
        }
        const data = (await res.json()) as NotificationPushPreferences;
        if (!cancelled) {
          setPreferences(data);
        }
      } catch {
        if (!cancelled) {
          setLoadError(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = async (
    key: NotificationPushCategory,
    next: boolean,
  ): Promise<void> => {
    if (!preferences || busy) {
      return;
    }

    const previous = preferences;
    // Optimistic update; the server response below is authoritative and a
    // failure rolls back — a setting is never silently pretended to be saved.
    setPreferences({ ...preferences, [key]: next });
    setBusy(true);
    setSaveError(null);

    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next }),
      });
      if (!res.ok) {
        throw new Error("request failed");
      }
      const saved = (await res.json()) as NotificationPushPreferences;
      setPreferences(saved);
    } catch {
      setPreferences(previous);
      setSaveError("Could not save your preference. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-8 rounded-xl border border-border bg-card p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-foreground">
        Notification Settings
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Choose which push notifications Snappy sends to your devices. Muting a
        category only stops push delivery — your notification history is never
        deleted.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Browser notification permission is separate: use the Notifications card
        above to enable or disable push on this device.
      </p>

      <div className="mt-4">
        {loadError ? (
          <p className="text-sm text-muted-foreground" role="alert">
            Could not load your notification settings. Please refresh and try
            again.
          </p>
        ) : null}

        {!loadError && preferences === null ? (
          <p className="text-sm text-muted-foreground">
            Loading notification settings…
          </p>
        ) : null}

        {preferences !== null ? (
          <ul className="divide-y divide-border">
            {CATEGORIES.map((category) => {
              const enabled = preferences[category.key];
              return (
                <li
                  key={category.key}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {category.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {category.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={category.label}
                    disabled={busy}
                    onClick={() => void handleToggle(category.key, !enabled)}
                    className={`inline-flex w-14 shrink-0 cursor-pointer items-center rounded-full border px-1 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
                      enabled
                        ? "justify-end border-primary bg-primary/15"
                        : "justify-start border-border bg-muted"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-5 w-5 rounded-full ${
                        enabled ? "bg-primary" : "bg-muted-foreground/40"
                      }`}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {saveError ? (
        <p className="mt-3 text-sm text-muted-foreground" role="alert">
          {saveError}
        </p>
      ) : null}
    </section>
  );
}
