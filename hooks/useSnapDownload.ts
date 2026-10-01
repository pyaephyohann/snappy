"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { downloadImage } from "@/lib/download-image";
import {
  DOWNLOAD_USAGE_ENDPOINT,
  OUT_OF_SPARKS_MESSAGE,
  generateDownloadIdempotencyKey,
  requestDownloadAuthorization,
} from "@/lib/download-authorization";
import type { DownloadUsageSnapshot } from "@/lib/download-authorization";

/** Pending Spark confirmation surfaced to the confirmation modal. */
export interface PendingSparkDownload {
  /** Server-provided Spark cost for the next download. */
  sparkCost: number;
  /** Server-provided free allowance per Asia/Yangon day. */
  freeDailyDownloads: number;
}

interface UseSnapDownloadOptions {
  imageUrl: string;
  filename: string;
  /** Fetch + expose the daily free-download usage (viewer surfaces only). */
  trackUsage?: boolean;
  /** User-facing message when authorization or the image transfer fails. */
  failureMessage?: string;
}

/**
 * Shared client flow for one Snap download (D3 — Download Snap Limit with
 * Sparks). Used by both `SnapCard` and `SnapViewer`, so Web and the Telegram
 * Mini App run the exact same server-authoritative accounting:
 *
 * 1. POST /api/downloads/authorize (free attempt).
 * 2. FREE → download the image immediately.
 * 3. SPARK_REQUIRED → open the confirmation modal (cost comes from the
 *    server; the client never decides).
 * 4. Confirm → re-request with `confirmed: true`; the server debits exactly
 *    1 Spark idempotently (or reports INSUFFICIENT_SPARKS, in which case no
 *    image download happens).
 * 5. Only after an authorized response does the unchanged
 *    `lib/download-image.ts` transfer the actual bytes.
 *
 * Double-click protection is synchronous (`inFlightRef`) and does not
 * replace server-side accounting, which stays authoritative.
 *
 * Idempotency: one key per logical download attempt, retained across retries
 * once a Spark charge may have committed — so a retry after a lost response
 * or a failed image transfer can never charge twice for the same download.
 */
export function useSnapDownload({
  imageUrl,
  filename,
  trackUsage = false,
  failureMessage = "Download failed. Please try again.",
}: UseSnapDownloadOptions) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [pendingSpark, setPendingSpark] = useState<PendingSparkDownload | null>(
    null,
  );
  const [isConfirmingSpark, setIsConfirmingSpark] = useState(false);
  const [sparkConfirmError, setSparkConfirmError] = useState<string | null>(null);
  const [usage, setUsage] = useState<DownloadUsageSnapshot | null>(null);

  // Synchronous re-entry guard (state alone can be stale within one tick).
  const inFlightRef = useRef(false);
  // Key of the current logical download attempt.
  const attemptKeyRef = useRef<string | null>(null);
  // Set once a Spark charge for this attempt may have committed; reused by
  // every retry until the image transfer succeeds.
  const chargedKeyRef = useRef<string | null>(null);

  const applyUsage = useCallback((snapshot: DownloadUsageSnapshot) => {
    setUsage({
      freeDownloadsUsed: snapshot.freeDownloadsUsed,
      freeDownloadsRemaining: snapshot.freeDownloadsRemaining,
      freeDailyDownloads: snapshot.freeDailyDownloads,
      isFreeExhausted: snapshot.isFreeExhausted,
    });
  }, []);

  const refreshUsage = useCallback(async () => {
    try {
      const response = await fetch(DOWNLOAD_USAGE_ENDPOINT, {
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) return;
      const data = (await response.json()) as DownloadUsageSnapshot | null;
      if (data && typeof data.freeDownloadsUsed === "number") {
        applyUsage(data);
      }
    } catch {
      // Keep the last authoritative snapshot; never invent values.
    }
  }, [applyUsage]);

  useEffect(() => {
    if (!trackUsage) return;
    // Deferred like useSparkUsage so the effect body performs no sync setState.
    const timer = setTimeout(() => void refreshUsage(), 0);
    return () => clearTimeout(timer);
  }, [trackUsage, refreshUsage]);

  /** Transfer the image bytes — only ever called after authorization. */
  const runImageDownload = useCallback(async () => {
    setIsDownloading(true);
    try {
      await downloadImage(imageUrl, filename);
      // Logical download fulfilled: the next tap starts a new attempt.
      chargedKeyRef.current = null;
      attemptKeyRef.current = null;
      setPendingSpark(null);
    } catch {
      // The server already authorized (and possibly charged). The browser
      // download architecture cannot confirm file receipt, so no refund or
      // second charge is attempted — the retained idempotency key makes the
      // retry replay the same ledger reference instead of charging again.
      setDownloadError(failureMessage);
    } finally {
      setIsDownloading(false);
      setIsConfirmingSpark(false);
      inFlightRef.current = false;
    }
  }, [imageUrl, filename, failureMessage]);

  /** Step 1: ask the server to authorize this download (free first). */
  const startDownload = useCallback(async () => {
    if (inFlightRef.current || pendingSpark) return;
    inFlightRef.current = true;
    setDownloadError(null);
    setSparkConfirmError(null);
    setIsDownloading(true);

    const alreadyCharged = chargedKeyRef.current !== null;
    const key =
      chargedKeyRef.current ?? generateDownloadIdempotencyKey();
    attemptKeyRef.current = key;

    // Transport failures resolve to { reason: "ERROR" } — never throws.
    const result = await requestDownloadAuthorization({
      idempotencyKey: key,
      confirmed: alreadyCharged,
    });

    if (result.authorized) {
      applyUsage(result);
      await runImageDownload();
      return;
    }

    if (result.reason === "SPARK_REQUIRED") {
      applyUsage(result);
      setPendingSpark({
        sparkCost: result.sparkCost,
        freeDailyDownloads: result.freeDailyDownloads,
      });
      setIsDownloading(false);
      inFlightRef.current = false;
      return;
    }

    setDownloadError(
      result.reason === "INSUFFICIENT_SPARKS"
        ? OUT_OF_SPARKS_MESSAGE
        : failureMessage,
    );
    setIsDownloading(false);
    inFlightRef.current = false;
  }, [pendingSpark, applyUsage, runImageDownload, failureMessage]);

  /** Step 2: the user confirmed — the server now verifies and charges. */
  const confirmSparkDownload = useCallback(async () => {
    if (inFlightRef.current || !attemptKeyRef.current) return;
    inFlightRef.current = true;
    setIsConfirmingSpark(true);
    setSparkConfirmError(null);

    const key = attemptKeyRef.current;
    // From here the charge may commit; retain the key so every retry
    // replays the same idempotent ledger reference.
    chargedKeyRef.current = key;

    const result = await requestDownloadAuthorization({
      idempotencyKey: key,
      confirmed: true,
    });

    if (result.authorized) {
      applyUsage(result);
      await runImageDownload();
      return;
    }

    if (result.reason === "INSUFFICIENT_SPARKS") {
      setSparkConfirmError(OUT_OF_SPARKS_MESSAGE);
    } else if (result.reason === "SPARK_REQUIRED") {
      // Cannot happen with confirmed=true; keep the modal usable.
      setSparkConfirmError(failureMessage);
    } else {
      // Network/server failure: the charge may or may not have landed, so
      // the retained key keeps a confirm retry idempotent.
      setSparkConfirmError(failureMessage);
    }
    setIsConfirmingSpark(false);
    inFlightRef.current = false;
  }, [applyUsage, runImageDownload, failureMessage]);

  const cancelSparkDownload = useCallback(() => {
    // Never abandon an in-flight charge.
    if (inFlightRef.current) return;
    setPendingSpark(null);
    setSparkConfirmError(null);
    if (chargedKeyRef.current === null) {
      attemptKeyRef.current = null;
    }
  }, []);

  return {
    isDownloading,
    downloadError,
    pendingSpark,
    isConfirmingSpark,
    sparkConfirmError,
    usage,
    startDownload,
    confirmSparkDownload,
    cancelSparkDownload,
  };
}
