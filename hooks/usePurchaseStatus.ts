"use client";

/**
 * Bounded, single-loop purchase status polling (S7-B.4).
 *
 * Observes `GET /api/subscription/purchases/[id]` (the sole source of
 * truth) on a gentle cadence and stops on the first terminal status. The
 * client can never cause a transition — it only reads.
 *
 * Lifecycle guarantees:
 * - exactly ONE timer loop per hook instance (a timer ref guards against
 *   stacked loops);
 * - polling stops on terminal status, unmount, request cancellation, or
 *   when the bounded window (PURCHASE_POLL_WINDOW_MS) expires — expiry
 *   reports `stillProcessing`, never a failure;
 * - polling pauses while the tab is hidden and resumes (with an immediate
 *   check) when it becomes visible again;
 * - transient network errors keep the loop alive until the window ends;
 *   auth/not-found errors stop it because they cannot fix themselves.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchPurchaseStatus,
  isPollingTerminalStatus,
  PURCHASE_POLL_INTERVAL_MS,
  PURCHASE_POLL_WINDOW_MS,
  type PurchaseSnapshot,
  type PurchaseStatusError,
} from "@/lib/purchase-status-client";

export type PurchaseStatusState = {
  /** Latest server-reported purchase, or null before the first response. */
  purchase: PurchaseSnapshot | null;
  /** A status request is currently in flight. */
  checking: boolean;
  /** The bounded polling window ended without a terminal status. */
  stillProcessing: boolean;
  /** Why the last lookup failed, if it did. `network` may be transient. */
  error: PurchaseStatusError | null;
  /** Manually re-check now (also restarts the polling window). */
  checkNow: () => void;
};

export function usePurchaseStatus(
  purchaseId: string | null,
): PurchaseStatusState {
  const [purchase, setPurchase] = useState<PurchaseSnapshot | null>(null);
  const [checking, setChecking] = useState(false);
  const [stillProcessing, setStillProcessing] = useState(false);
  const [error, setError] = useState<PurchaseStatusError | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const deadlineRef = useRef(0);
  const stoppedRef = useRef(false);
  const mountedRef = useRef(false);
  const tickRef = useRef<() => void>(() => {});

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopPolling = useCallback(() => {
    stoppedRef.current = true;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => {
    if (!purchaseId) return;
    mountedRef.current = true;
    stoppedRef.current = false;
    deadlineRef.current = Date.now() + PURCHASE_POLL_WINDOW_MS;
    // Reset for the new purchase deferred one microtask (never a
    // synchronous cascading render); the first fetch resolves after it.
    queueMicrotask(() => {
      if (!mountedRef.current) return;
      setPurchase(null);
      setError(null);
      setStillProcessing(false);
    });

    const schedule = () => {
      // Single loop: never stack timers for the same purchase.
      if (!mountedRef.current || stoppedRef.current) return;
      if (timerRef.current !== null) return;
      if (Date.now() >= deadlineRef.current) {
        // Window over: a neutral "still processing" state, never a failure.
        setStillProcessing(true);
        stopPolling();
        return;
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void tickRef.current();
      }, PURCHASE_POLL_INTERVAL_MS);
    };

    const tick = async () => {
      if (!mountedRef.current || stoppedRef.current) return;
      // Paused while hidden; the visibility handler resumes.
      if (typeof document !== "undefined" && document.hidden) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setChecking(true);
      const result = await fetchPurchaseStatus(purchaseId, controller.signal);
      if (!mountedRef.current || controller.signal.aborted) return;
      setChecking(false);

      if (result.kind === "ok") {
        setPurchase(result.purchase);
        setError(null);
        if (isPollingTerminalStatus(result.purchase.status)) {
          stopPolling();
          return;
        }
        schedule();
        return;
      }
      if (result.kind === "network") {
        // Transient: keep asking within the window, and say so neutrally.
        setError("network");
        schedule();
        return;
      }
      // unauthorized | not_found — will not resolve by polling more.
      setError(result.kind);
      stopPolling();
    };
    tickRef.current = () => void tick();

    const onVisibilityChange = () => {
      if (typeof document === "undefined") return;
      if (document.hidden) {
        // Pause: no polling while the tab is in the background.
        clearTimer();
      } else if (!stoppedRef.current && mountedRef.current) {
        // Resume safely with an immediate check.
        clearTimer();
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // First check immediately, then settle into the cadence.
    void tick();

    return () => {
      mountedRef.current = false;
      stopPolling();
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [purchaseId, clearTimer, stopPolling]);

  const checkNow = useCallback(() => {
    if (!purchaseId) return;
    // An explicit user check restarts the bounded window.
    deadlineRef.current = Date.now() + PURCHASE_POLL_WINDOW_MS;
    stoppedRef.current = false;
    setStillProcessing(false);
    clearTimer();
    void tickRef.current();
  }, [purchaseId, clearTimer]);

  return { purchase, checking, stillProcessing, error, checkNow };
}
