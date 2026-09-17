"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isTelegramMiniAppPath } from "@/lib/telegram/mini-app-routes";

export default function ServiceWorkerRegistration() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    if (pathname && isTelegramMiniAppPath(pathname)) {
      return;
    }

    const isDev = process.env.NODE_ENV === "development";

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        if (isDev) {
          console.info("[PWA] Service worker registered", registration.scope);
        }
      })
      .catch((error) => {
        if (isDev) {
          console.error("[PWA] Service worker registration failed", error);
        }
      });
  }, [pathname]);

  return null;
}
