"use client";

import { useCallback, useEffect, useState } from "react";
import type { SparkUsageSummary } from "@/lib/spark-usage";

const SPARK_USAGE_ENDPOINT = "/api/sparks/usage";

/**
 * Fetches the server-authoritative Spark usage summary used by the Snap
 * upload UI (S2).
 *
 * The client only renders what the server returns — it never computes
 * balances, costs, or eligibility. `applyUsage` lets a caller adopt the
 * refreshed summary returned by a successful upload response instead of
 * issuing a duplicate request.
 */
export function useSparkUsage() {
  const [usage, setUsage] = useState<SparkUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(SPARK_USAGE_ENDPOINT, {
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) {
        // Auth failure follows the existing session behavior; transient
        // failures leave the indicator hidden rather than guessing state.
        setUsage(null);
        return;
      }
      const data = (await response.json()) as { usage?: SparkUsageSummary };
      setUsage(data.usage ?? null);
    } catch {
      setUsage(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  /** Adopt a summary returned by the server with an upload result. */
  const applyUsage = useCallback((next: SparkUsageSummary | null) => {
    if (next) {
      setUsage(next);
      setLoading(false);
    }
  }, []);

  return { usage, loading, refresh, applyUsage };
}
