"use client";

import { useCallback, useEffect, useState } from "react";

export function useUnreadNotificationCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications/unread-count");
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as { count: number };
      setCount(typeof data.count === "number" ? data.count : 0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/notifications/unread-count");
        if (!response.ok || cancelled) {
          return;
        }
        const data = (await response.json()) as { count: number };
        if (!cancelled) {
          setCount(typeof data.count === "number" ? data.count : 0);
        }
      } catch {
        /* ignore */
      }
    })();

    const onFocus = () => void refresh();
    const onUpdated = () => void refresh();

    window.addEventListener("focus", onFocus);
    window.addEventListener("snappy:notifications-updated", onUpdated);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("snappy:notifications-updated", onUpdated);
    };
  }, [refresh]);

  return { count, refresh };
}
