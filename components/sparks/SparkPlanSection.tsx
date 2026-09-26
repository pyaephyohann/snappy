"use client";

import { useSparkUsage } from "@/hooks/useSparkUsage";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DEFAULT_PLAN,
  PAID_PLANS,
  PLAN_CONFIG,
} from "@/lib/subscription-plans";
import type { SubscriptionPlan } from "@prisma/client";

/**
 * Plan comparison section (S6 — Spark Plan UI Foundation).
 *
 * Display-only: every plan name, monthly price, subscription Spark grant,
 * and cost below is read from the authoritative `PLAN_CONFIG`
 * (`lib/subscription-plans.ts`) — no configuration is duplicated,
 * re-typed, or hard-coded here, and no price digit is written literally.
 *
 * The "Your plan" marker comes verbatim from the server-reported
 * `useSparkUsage()` summary (`usage.plan`), which already resolves the
 * effective plan (including the Free fallback for expired subscriptions).
 * The client performs no balance, affordability, status, or expiration
 * calculation, calls no API of its own, and offers no working action:
 * plan activation and payment belong to a later milestone (S7).
 */

const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  FREE: "Free",
  SPARK_PLUS: "Spark Plus",
  SPARK_PRO: "Spark Pro",
  SPARK_ULTRA: "Spark Ultra",
};

/** Comparison order: Free first, then paid plans in ascending tier. */
const PLAN_ORDER: SubscriptionPlan[] = [DEFAULT_PLAN, ...PAID_PLANS];

const priceFormatter = new Intl.NumberFormat("en-US");

/** Pluralizes the Spark unit for display only — never an economy calculation. */
function sparks(value: number): string {
  return `${value} ${value === 1 ? "Spark" : "Sparks"}`;
}

function PlanCard({
  plan,
  currentPlan,
}: {
  plan: SubscriptionPlan;
  /** Server-reported effective plan, or null while usage is unavailable. */
  currentPlan: SubscriptionPlan | null;
}) {
  const config = PLAN_CONFIG[plan];
  const isCurrent = currentPlan !== null && plan === currentPlan;

  return (
    <li
      className={
        isCurrent
          ? "rounded-xl border border-border bg-background p-4 ring-2 ring-primary"
          : "rounded-xl border border-border bg-background p-4"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-foreground">
          {PLAN_LABELS[plan]}
        </h4>
        {isCurrent ? (
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            Your plan
          </span>
        ) : null}
      </div>

      <p className="mt-1 text-sm text-muted-foreground">
        {priceFormatter.format(config.monthlyPriceMmk)} MMK / month
      </p>

      <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
        <li>{config.subscriptionSparks} subscription Sparks</li>
        <li>{config.freeUploadsPerDay} free uploads/day</li>
        <li>{sparks(config.extraUploadCost)} per extra upload</li>
        <li>{sparks(config.captionEditCost)} per caption edit</li>
      </ul>
    </li>
  );
}

function PlanGrid({
  currentPlan,
}: {
  currentPlan: SubscriptionPlan | null;
}) {
  return (
    <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {PLAN_ORDER.map((plan) => (
        <PlanCard key={plan} plan={plan} currentPlan={currentPlan} />
      ))}
    </ul>
  );
}

export default function SparkPlanSection() {
  const { usage, loading } = useSparkUsage();

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Plans
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Compare the four Snappy plans. Plan activation will be available in a
        future update.
      </p>

      {loading ? (
        <div
          className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
          role="status"
          aria-label="Loading plans"
        >
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
        </div>
      ) : !usage ? (
        // Usage could not be fetched: the static authoritative configuration
        // still renders, but no current plan is marked and no value is
        // invented. Only this section reports the failure.
        <>
          <p className="mt-3 text-sm text-destructive" role="alert">
            Couldn&apos;t load your current plan right now.
          </p>
          <PlanGrid currentPlan={null} />
        </>
      ) : (
        // Server-authoritative current plan: `usage.plan` is rendered as-is,
        // exactly what SparkBalanceCard shows alongside it.
        <PlanGrid currentPlan={usage.plan} />
      )}
    </section>
  );
}
