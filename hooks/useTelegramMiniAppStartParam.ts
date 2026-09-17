"use client";

import { useEffect, useState } from "react";

/**
 * Reads Telegram WebApp start_param once (for deep links). Not used for auth.
 */
export function useTelegramMiniAppStartParam(): string | null {
  const [startParam, setStartParam] = useState<string | null>(null);

  useEffect(() => {
    const raw = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
    if (typeof raw === "string" && raw.trim()) {
      queueMicrotask(() => setStartParam(raw.trim()));
    }
  }, []);

  return startParam;
}
