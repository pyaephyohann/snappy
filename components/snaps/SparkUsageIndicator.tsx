"use client";

import type { SparkUsageSummary } from "@/lib/spark-usage";

interface SparkUsageIndicatorProps {
  usage: SparkUsageSummary | null;
  loading?: boolean;
}

/**
 * Compact Spark / free-upload indicator shown in the Snap upload experience.
 *
 * Renders only server-provided values — no client-side Spark math.
 * Returns null while loading or when no summary is available so a failed
 * fetch never blocks or misleads the upload flow.
 */
export default function SparkUsageIndicator({
  usage,
  loading = false,
}: SparkUsageIndicatorProps) {
  if (loading || !usage) return null;

  const sparksLabel = usage.balance === 1 ? "Spark" : "Sparks";

  return (
    <div
      className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm"
    >
      <span className="inline-flex items-center gap-1 font-medium text-foreground">
        <span aria-hidden="true">✨</span>
        {usage.balance} {sparksLabel}
      </span>
      <span className="text-muted-foreground">
        Free uploads today: {usage.freeUploadsUsed} / {usage.freeDailyUploads}
      </span>
    </div>
  );
}
