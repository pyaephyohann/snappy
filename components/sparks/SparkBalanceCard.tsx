"use client";

import { useSparkUsage } from "@/hooks/useSparkUsage";
import { Skeleton } from "@/components/ui/skeleton";
import { formatAdminDate } from "@/lib/admin-types";
import type { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

/**
 * Sparks card (S5 — Spark UI Foundation).
 *
 * Read-only display of the server-authoritative Spark usage summary on the
 * shared profile surface, so Web, PWA, and the Telegram Mini App all show the
 * same numbers through one component.
 *
 * Every value below is rendered exactly as the server reports it: no
 * client-side balance, cost, affordability, or expiration math; no plan
 * pricing and no payment functionality (both deferred to S7). While the
 * summary is loading or unavailable the card shows a skeleton or an alert
 * instead of guessing a balance.
 */

const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  FREE: "Free",
  SPARK_PLUS: "Spark Plus",
  SPARK_PRO: "Spark Pro",
  SPARK_ULTRA: "Spark Ultra",
};

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  ACTIVE: "Active",
  CANCELED: "Canceled",
  EXPIRED: "Expired",
};

/** Free state label for a user with no paid subscription row (status null). */
const FREE_STATE_LABEL = "Free";

export default function SparkBalanceCard() {
  const { usage, loading } = useSparkUsage();

  if (loading) {
    return (
      <section
        className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
        aria-busy="true"
      >
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Sparks
        </h3>
        <div
          className="mt-4 space-y-3"
          role="status"
          aria-label="Loading Spark balance"
        >
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </section>
    );
  }

  if (!usage) {
    // The summary could not be fetched — never invent a balance. The rest of
    // the profile page keeps working; only this card reports the failure.
    return (
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Sparks
        </h3>
        <p className="mt-3 text-sm text-destructive" role="alert">
          Couldn&apos;t load your Spark balance right now.
        </p>
      </section>
    );
  }

  const planLabel = PLAN_LABELS[usage.plan];
  const statusLabel = usage.subscriptionStatus
    ? STATUS_LABELS[usage.subscriptionStatus]
    : FREE_STATE_LABEL;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Sparks
      </h3>

      <dl className="mt-4 grid grid-cols-3 gap-x-4 gap-y-3">
        <div>
          <dt className="text-xs text-muted-foreground">Total</dt>
          <dd className="mt-1 text-lg font-semibold text-foreground">
            {usage.balance} ✨
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Earned</dt>
          <dd className="mt-1 text-lg font-semibold text-foreground">
            {usage.earnedSparks} ✨
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Subscription</dt>
          <dd className="mt-1 text-lg font-semibold text-foreground">
            {usage.subscriptionSparks} ✨
          </dd>
        </div>
      </dl>

      <dl className="mt-4 divide-y divide-border text-sm">
        <div className="flex items-center justify-between gap-3 py-2">
          <dt className="text-muted-foreground">Plan</dt>
          <dd className="font-medium text-foreground">{planLabel}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 py-2">
          <dt className="text-muted-foreground">Status</dt>
          <dd className="font-medium text-foreground">{statusLabel}</dd>
        </div>
        {/* Only shown when the server reports a real billing period — no
            expiration date is ever fabricated for the Free state. */}
        {usage.subscriptionPeriodEnd ? (
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="text-muted-foreground">Renews / ends</dt>
            <dd className="font-medium text-foreground">
              {formatAdminDate(usage.subscriptionPeriodEnd)}
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
