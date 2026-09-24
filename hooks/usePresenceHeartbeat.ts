"use client";

import { useEffect, useRef } from "react";
import { HEARTBEAT_INTERVAL_MS } from "@/lib/presence";

/**
 * S7 presence heartbeat.
 *
 * Writes an authenticated heartbeat every `HEARTBEAT_INTERVAL_MS` while the
 * page is visible and stops entirely while it is hidden. This hook only writes
 * presence; reads come from the existing S4 chat polling DTOs.
 */
export function usePresenceHeartbeat() {
  const controllerRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function sendHeartbeat() {
      if (cancelled || inFlightRef.current) return;
      if (document.visibilityState !== "visible") return;

      inFlightRef.current = true;
      const controller = new AbortController();
      controllerRef.current = controller;

      try {
        await fetch("/api/presence", {
          method: "PATCH",
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
      } catch {
        // Best-effort: a failed heartbeat is retried on the next interval.
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
        inFlightRef.current = false;
      }
    }

    let timer: ReturnType<typeof setInterval> | null = null;

    function startHeartbeat() {
      if (timer !== null) return;
      void sendHeartbeat();
      timer = setInterval(() => void sendHeartbeat(), HEARTBEAT_INTERVAL_MS);
    }

    function stopHeartbeat() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      controllerRef.current?.abort();
      controllerRef.current = null;
    }

    function onVisibilityChange() {
      if (cancelled) return;
      if (document.visibilityState === "visible") {
        void sendHeartbeat();
        startHeartbeat();
      } else {
        stopHeartbeat();
      }
    }

    if (document.visibilityState === "visible") startHeartbeat();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      stopHeartbeat();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
}
