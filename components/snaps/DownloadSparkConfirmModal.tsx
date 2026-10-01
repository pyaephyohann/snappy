"use client";

import { GlowButton } from "@/components/ui/glow-button";
import type { PendingSparkDownload } from "@/hooks/useSnapDownload";

interface DownloadSparkConfirmModalProps {
  /**
   * Server-provided pending Spark download (from `SPARK_REQUIRED`).
   * Null hides the dialog — the cost/allowance values are never invented
   * by the client.
   */
  pending: PendingSparkDownload | null;
  /** True while the confirmed authorization request is in flight. */
  confirming?: boolean;
  /** Error from the last confirmation attempt (e.g. out of Sparks). */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Post-limit confirmation shown before spending Sparks on a Snap download
 * (D3 — Download Snap Limit with Sparks).
 *
 * A UX guard only: the server independently re-verifies the exhausted free
 * allowance, the confirmed intent, and the Spark balance. Wording and
 * styling follow the existing caption-edit Spark confirmation in
 * `SnapViewer`. Shared by SnapCard and SnapViewer, so Web and the Telegram
 * Mini App render the identical dialog through the same components.
 *
 * `stopPropagation` keeps clicks inside the dialog from bubbling to a
 * clickable SnapCard parent.
 */
export default function DownloadSparkConfirmModal({
  pending,
  confirming = false,
  error = null,
  onConfirm,
  onCancel,
}: DownloadSparkConfirmModalProps) {
  if (!pending) return null;

  const { sparkCost, freeDailyDownloads } = pending;
  const costLabel = `${sparkCost} ${sparkCost === 1 ? "Spark" : "Sparks"}`;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="download-spark-confirm-title"
      onClick={(event) => event.stopPropagation()}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <h3
          id="download-spark-confirm-title"
          className="text-base font-semibold text-foreground"
        >
          Free downloads used
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          You&apos;ve used all {freeDailyDownloads} free downloads today.
        </p>
        <p className="mt-1 text-sm text-foreground">
          Download this Snap for {costLabel}?
        </p>
        {error ? (
          <p className="mt-2 text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="flex-1 rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <GlowButton
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            glowClassName="flex-1"
            className="w-full flex-1 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 sm:text-base"
          >
            {confirming ? "Processing…" : `Download for ${costLabel}`}
          </GlowButton>
        </div>
      </div>
    </div>
  );
}
