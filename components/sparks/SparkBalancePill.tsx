"use client";

import Link from "next/link";
import { useSparkUsage } from "@/hooks/useSparkUsage";

/**
 * Compact Spark balance pill for the navigation bar.
 *
 * Renders the server-authoritative balance from the existing
 * `useSparkUsage()` summary (`GET /api/sparks/usage`) — the same numbers the
 * profile Sparks card shows. The client never calculates, rounds, or infers a
 * balance; while the summary is loading or unavailable the pill stays hidden
 * rather than guessing. A balance of 0 is still shown.
 *
 * Tapping opens the existing profile surface (no new route), where the Sparks
 * card and Spark plans already live.
 */
export default function SparkBalancePill({
  href = "/profile",
}: {
  /** Existing destination that hosts the Spark balance/plans (profile by default). */
  href?: string;
}) {
  const { usage } = useSparkUsage();

  if (!usage) {
    return null;
  }

  return (
    <Link
      href={href}
      title="Sparks"
      aria-label={`Sparks: ${usage.balance}. Open your Sparks.`}
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span aria-hidden="true">✨</span>
      <span>{usage.balance}</span>
    </Link>
  );
}
