"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
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
  }, []);

  return null;
}
