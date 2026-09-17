"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getUnreadLocalNotificationCount,
  NOTIFICATIONS_UPDATED_EVENT,
} from "@/lib/local-notifications";

export function useUnreadNotificationCount() {
  const [count, setCount] = useState(() => getUnreadLocalNotificationCount());

  const refresh = useCallback(() => {
    setCount(getUnreadLocalNotificationCount());
  }, []);

  useEffect(() => {
    const onFocus = () => refresh();
    const onUpdated = () => refresh();
    const onStorage = (event: StorageEvent) => {
      if (event.key === "snappy:notifications" || event.key === null) {
        refresh();
      }
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, onUpdated);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, onUpdated);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  return { count, refresh };
}
