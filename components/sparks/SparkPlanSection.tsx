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

/** The "most popular" plan to highlight with Cursor-style accent badge. */
const FEATURED_PLAN: SubscriptionPlan = "SPARK_PRO";

/** Comparison order: Free first, then paid plans in ascending tier. */
const PLAN_ORDER: SubscriptionPlan[] = [DEFAULT_PLAN, ...PAID_PLANS];

const priceFormatter = new Intl.NumberFormat("en-US");

/** Pluralizes the Spark unit for display only — never an economy calculation. */
function sparks(value: number): string {
  return `${value} ${value === 1 ? "Spark" : "Sparks"}`;
}

/** Thin horizontal rule divider matching Cursor's section separator style. */
function FeatureGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 border-b border-border pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

/** Single feature row with a leading checkmark — mirrors Cursor's ✓ list. */
function FeatureRow({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center"
        aria-hidden="true"
      >
        {/* Checkmark SVG matching Cursor's style */}
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5 text-primary"
        >
          <polyline points="2.5 8 6 11.5 13.5 4" />
        </svg>
      </span>
      <span className="text-sm text-muted-foreground">{children}</span>
    </li>
  );
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
  const isFeatured = plan === FEATURED_PLAN;

  return (
    <li
      className={[
        "relative flex flex-col rounded-2xl border p-6 transition-shadow duration-200",
        isFeatured
          ? "border-primary/50 bg-primary/5 shadow-lg shadow-primary/10"
          : "border-border bg-card hover:shadow-md hover:shadow-black/20",
      ].join(" ")}
      aria-labelledby={`plan-label-${plan}`}
    >
      {/* ── Plan header ──────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        <h4
          id={`plan-label-${plan}`}
          className="text-base font-semibold text-foreground"
        >
          {PLAN_LABELS[plan]}
        </h4>
        <div className="flex shrink-0 items-center gap-1.5">
          {isCurrent && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              Your plan
            </span>
          )}
          {isFeatured && !isCurrent && (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
              Most popular
            </span>
          )}
        </div>
      </div>

      {/* ── Price block ───────────────────────────────────── */}
      <p className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-bold tracking-tight text-foreground">
          {priceFormatter.format(config.monthlyPriceMmk)} MMK
        </span>
        <span className="text-sm text-muted-foreground">/month</span>
      </p>

      {/* ── CTA button ────────────────────────────────────── */}
      <div className="mt-5">
        <SparkPlanPurchaseAction
          plan={plan}
          planLabel={PLAN_LABELS[plan]}
          currentPlan={currentPlan}
          subscriptionStatus={subscriptionStatus}
          flow={flow}
        />
      </div>

      {/* ── Divider ───────────────────────────────────────── */}
      <hr className="my-5 border-border" />

      {/* ── Usage summary (prominent) ─────────────────────── */}
      <div className="mb-4">
        <p className="text-xl font-semibold text-foreground">
          {config.subscriptionSparks.toLocaleString()}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          subscription Sparks / month
        </p>
      </div>

      {/* ── Feature group ─────────────────────────────────── */}
      <div className="mt-auto space-y-4">
        <div>
          <FeatureGroupLabel>Included</FeatureGroupLabel>
          <ul className="mt-3 space-y-2.5" role="list">
            <FeatureRow>
              {config.freeUploadsPerDay} free upload
              {config.freeUploadsPerDay === 1 ? "" : "s"} per day
            </FeatureRow>
            <FeatureRow>
              {sparks(config.extraUploadCost)} per extra upload
            </FeatureRow>
            <FeatureRow>
              {sparks(config.captionEditCost)} per caption edit
            </FeatureRow>
          </ul>
        </div>
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
    <ul
      className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      role="list"
    >
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

function PlanGridSkeleton() {
  return (
    <ul
      className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      role="status"
      aria-label="Loading plans"
    >
      {PLAN_ORDER.map((plan) => (
        <li key={plan} className="rounded-2xl border border-border bg-card p-6">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="mt-4 h-8 w-36" />
          <Skeleton className="mt-5 h-10 w-full rounded-xl" />
          <hr className="my-5 border-border" />
          <Skeleton className="h-6 w-16" />
          <Skeleton className="mt-1 h-4 w-40" />
          <Skeleton className="mt-6 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-5/6" />
          <Skeleton className="mt-2 h-4 w-4/6" />
        </li>
      ))}
    </ul>
  );
}

export default function SparkPlanSection() {
  const { usage, loading } = useSparkUsage();
  const purchaseFlow = useSparkPlanPurchase();

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      {/* Section header — mirrors Cursor's "Pricing" h1 at a card scale */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Plans
        </h3>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Compare the four Snappy plans. Choose a paid plan to subscribe — the
        price shown is confirmed by Snappy when you start, and your plan is
        updated here automatically after payment.
      </p>

      {loading ? (
        <PlanGridSkeleton />
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
