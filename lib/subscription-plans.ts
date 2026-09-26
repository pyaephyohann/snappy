/**
 * Subscription Plan Configuration (S4 — Subscription Foundation)
 *
 * The ONE authoritative definition of every subscription plan's product
 * rules: monthly price, subscription Spark grant, daily free uploads, and
 * Spark costs. Server services resolve the caller's effective plan from the
 * database and read all numbers from this table — never from the client.
 *
 * Prices are product configuration only (S4). Payment integration, checkout,
 * and any purchase flow are explicitly deferred to a later milestone (S7).
 *
 * This module intentionally has no Prisma runtime imports (type-only), so it
 * stays trivially importable from every server service without cycles.
 */
import type { SubscriptionPlan } from "@prisma/client";

export interface PlanConfig {
  /** Monthly price in Myanmar Kyat. Product configuration only (no payment in S4). */
  monthlyPriceMmk: number;
  /** Subscription Sparks granted at the start of each billing period. */
  subscriptionSparks: number;
  /** Free Snap uploads per Asia/Yangon day. */
  freeUploadsPerDay: number;
  /** Spark cost of one upload beyond the free daily allowance. */
  extraUploadCost: number;
  /** Spark cost of one caption edit. */
  captionEditCost: number;
}

/**
 * Authoritative plan configuration. Do NOT hard-code these numbers anywhere
 * else in the application — always resolve through PLAN_CONFIG/getPlanConfig.
 *
 * The daily Spark *earning* cap (10/day) and upload reward (+1) are locked S1
 * economy rules and are intentionally NOT per-plan (see spark-service.ts).
 */
export const PLAN_CONFIG: Record<SubscriptionPlan, PlanConfig> = {
  FREE: {
    monthlyPriceMmk: 0,
    subscriptionSparks: 0,
    freeUploadsPerDay: 10,
    extraUploadCost: 5,
    captionEditCost: 2,
  },
  SPARK_PLUS: {
    monthlyPriceMmk: 29000,
    subscriptionSparks: 100,
    freeUploadsPerDay: 10,
    extraUploadCost: 4,
    captionEditCost: 1,
  },
  SPARK_PRO: {
    monthlyPriceMmk: 59000,
    subscriptionSparks: 300,
    freeUploadsPerDay: 10,
    extraUploadCost: 3,
    captionEditCost: 1,
  },
  SPARK_ULTRA: {
    monthlyPriceMmk: 99000,
    subscriptionSparks: 1000,
    freeUploadsPerDay: 15,
    extraUploadCost: 2,
    captionEditCost: 1,
  },
};

/** Effective plan for any user without an active paid subscription. */
export const DEFAULT_PLAN: SubscriptionPlan = "FREE";

/** Plans that can be established by activateSubscription (S4 service-level op). */
export const PAID_PLANS: readonly SubscriptionPlan[] = [
  "SPARK_PLUS",
  "SPARK_PRO",
  "SPARK_ULTRA",
];

/** Whether a plan is a paid plan (i.e. can carry subscription Spark grants). */
export function isPaidPlan(plan: SubscriptionPlan): boolean {
  return plan !== DEFAULT_PLAN;
}

/**
 * Resolve the authoritative configuration for a plan.
 * Falls back to FREE for any unknown value (defense against corrupted data).
 */
export function getPlanConfig(plan: SubscriptionPlan): PlanConfig {
  return PLAN_CONFIG[plan] ?? PLAN_CONFIG[DEFAULT_PLAN];
}

/**
 * Deterministic calendar-month arithmetic for billing periods.
 *
 * Adds `months` calendar months to `start`, clamping the day to the target
 * month's length (Jan 31 + 1 month → Feb 28/29). All arithmetic is done in
 * UTC so the same start always yields the same period end.
 */
export function addBillingMonths(start: Date, months: number): Date {
  const target = new Date(start.getTime());
  const dayOfMonth = target.getUTCDate();
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const daysInTargetMonth = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(dayOfMonth, daysInTargetMonth));
  return target;
}
