/**
 * Spark usage summary types (S2 — Snap Integration).
 *
 * This is a presentation-only projection of the authoritative Spark ledger and
 * daily counters. The server derives every field in `lib/spark-service.ts`;
 * the client only renders it and never computes balances or costs itself.
 *
 * This module intentionally has no server-only imports (Prisma, etc.) so client
 * components can consume the type without pulling server code into the bundle.
 */
import type { SubscriptionPlan } from "@prisma/client";

export interface SparkUsageSummary {
  /** Available Spark balance (earned + non-expired subscription). */
  balance: number;
  /** The user's effective plan, resolved server-side (FREE when no active subscription). */
  plan: SubscriptionPlan;
  /** Non-expired subscription Sparks available right now. */
  subscriptionSparks: number;
  /** Earned Sparks available right now (these never expire). */
  earnedSparks: number;
  /** ISO timestamp of the current billing-period end, or null when not on a paid plan. */
  subscriptionPeriodEnd: string | null;
  /** Free uploads used in the current Asia/Yangon day. */
  freeUploadsUsed: number;
  /** Free uploads left today (0 or positive). */
  freeUploadsRemaining: number;
  /** Configured free uploads per day (server constant). */
  freeDailyUploads: number;
  /** Sparks earned in the current Asia/Yangon day. */
  dailyEarnedSparks: number;
  /** Remaining daily earning capacity (0 or positive). */
  dailyEarnRemaining: number;
  /** Configured daily Spark earning cap (server constant). */
  dailyEarningCap: number;
  /** Spark cost of an upload once the free allowance is exhausted. */
  extraUploadCost: number;
  /** Spark cost of one caption edit. */
  captionEditCost: number;
  /** True when the user can afford a caption edit at the current server snapshot. */
  canAffordCaptionEdit: boolean;
  /** Sparks credited by an eligible (free) upload. */
  uploadReward: number;
  /** True when the next upload is expected to be Spark-paid. */
  nextUploadIsPaid: boolean;
  /** True when the user can afford the next upload (free uploads left, or enough Sparks). */
  canAffordNextUpload: boolean;
}
