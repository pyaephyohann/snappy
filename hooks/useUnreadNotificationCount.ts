"use client";

import { useCallback, useEffect, useState } from "react";
import { NOTIFICATIONS_UPDATED_EVENT } from "@/lib/local-notifications";

export function useUnreadNotificationCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count", {
        cache: "no-store",
      });
      if (!res.ok) {
        return;
      }
      const data = (await res.json()) as { count: number };
      setCount(data.count);
    } catch {
      /* keep previous count */
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    const onFocus = () => void refresh();
    const onUpdated = () => void refresh();

    window.addEventListener("focus", onFocus);
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, onUpdated);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, onUpdated);
    };
  }, [refresh]);

  return { count, refresh };
}
