"use client";

import { useSparkUsage } from "@/hooks/useSparkUsage";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SparkPlanPurchaseAction,
  SparkPlanPurchaseStatusPanel,
  useSparkPlanPurchase,
  type SparkPlanPurchaseFlowState,
} from "@/components/sparks/SparkPlanPurchaseFlow";
import {
  DEFAULT_PLAN,
  PAID_PLANS,
  PLAN_CONFIG,
} from "@/lib/subscription-plans";
import type { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

/**
 * Plan comparison section (S6 foundation + S7-B.4 purchase affordance).
 *
 * Every plan name, monthly price, subscription Spark grant, and cost below
 * is read from the authoritative `PLAN_CONFIG` (`lib/subscription-plans.ts`)
 * — no configuration is duplicated, re-typed, or hard-coded here, and no
 * price digit is written literally. Prices shown for a real purchase come
 * from the server's purchase record, never from client constants.
 *
 * The "Your plan" marker comes verbatim from the server-reported
 * `useSparkUsage()` summary (`usage.plan`), which already resolves the
 * effective plan (including the Free fallback for expired subscriptions).
 * The client performs no balance, affordability, status, or expiration
 * calculation. Purchase creation, payment initialization, and
 * server-authoritative status observation live in
 * `SparkPlanPurchaseFlow.tsx` (S7-B.4); this section only renders the
 * affordance and the flow's status panel.
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
  subscriptionStatus,
  flow,
}: {
  plan: SubscriptionPlan;
  /** Server-reported effective plan, or null while usage is unavailable. */
  currentPlan: SubscriptionPlan | null;
  /** Server-reported subscription status, or null when none is active. */
  subscriptionStatus: SubscriptionStatus | null;
  flow: SparkPlanPurchaseFlowState;
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

      <div className="mt-4">
        <SparkPlanPurchaseAction
          plan={plan}
          planLabel={PLAN_LABELS[plan]}
          currentPlan={currentPlan}
          subscriptionStatus={subscriptionStatus}
          flow={flow}
        />
      </div>
    </li>
  );
}

function PlanGrid({
  currentPlan,
  subscriptionStatus,
  flow,
}: {
  currentPlan: SubscriptionPlan | null;
  subscriptionStatus: SubscriptionStatus | null;
  flow: SparkPlanPurchaseFlowState;
}) {
  return (
    <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {PLAN_ORDER.map((plan) => (
        <PlanCard
          key={plan}
          plan={plan}
          currentPlan={currentPlan}
          subscriptionStatus={subscriptionStatus}
          flow={flow}
        />
      ))}
    </ul>
  );
}

export default function SparkPlanSection() {
  const { usage, loading } = useSparkUsage();
  const purchaseFlow = useSparkPlanPurchase();

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Plans
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Compare the four Snappy plans. Choose a paid plan to subscribe — the
        price shown is confirmed by Snappy when you start, and your plan is
        updated here automatically after payment.
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
          <PlanGrid
            currentPlan={null}
            subscriptionStatus={null}
            flow={purchaseFlow}
          />
        </>
      ) : (
        // Server-authoritative current plan: `usage.plan` is rendered as-is,
        // exactly what SparkBalanceCard shows alongside it.
        <PlanGrid
          currentPlan={usage.plan}
          subscriptionStatus={usage.subscriptionStatus}
          flow={purchaseFlow}
        />
      )}

      <SparkPlanPurchaseStatusPanel
        flow={purchaseFlow}
        planLabels={PLAN_LABELS}
      />
    </section>
  );
}
