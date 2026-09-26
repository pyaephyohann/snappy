/**
 * Spark Economy Service (S1 — Foundation, hardened)
 *
 * Server-side authority for all Spark business rules.
 * The ledger (SparkTransaction) is the source of truth — never a mutable
 * counter on the User model.
 *
 * Timezone: Asia/Yangon (UTC+6:30), consistent with the rest of the app.
 *
 * Concurrency model:
 * - Daily limits enforced via DailyUploadCounter with SELECT ... FOR UPDATE.
 * - Spark earning cap enforced atomically inside Prisma transactions.
 * - Spending uses SELECT ... FOR UPDATE on aggregated balances.
 * - All operations pass a consistent `now` parameter for deterministic testing.
 */

import { prisma } from "@/lib/prisma";
import type {
  SparkTransactionType,
  SparkTransactionSource,
  SparkKind,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import type { SparkUsageSummary } from "@/lib/spark-usage";
import {
  DEFAULT_PLAN,
  getPlanConfig,
} from "@/lib/subscription-plans";
import {
  getSubscription,
  isSubscriptionActive,
  resolveEffectivePlan,
} from "@/lib/subscription-service";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Myanmar timezone used throughout the application. */
const APP_TIMEZONE = "Asia/Yangon";

/** Yangon offset from UTC in hours (UTC+6:30). */
const YANGON_OFFSET_HOURS = 6.5;

/**
 * Free Snap uploads per day, Spark costs, and every other per-plan rule are
 * defined ONCE in PLAN_CONFIG (lib/subscription-plans.ts). These aliases are
 * derived from the FREE plan configuration so the locked S1 values remain
 * importable without becoming a second source of truth:
 *   FREE_DAILY_UPLOADS = 10
 *   EXTRA_UPLOAD_COST_SPARKS = 5
 *   CAPTION_EDIT_COST_SPARKS = 2
 * Tests assert these equal PLAN_CONFIG[DEFAULT_PLAN].
 */
export const FREE_DAILY_UPLOADS = getPlanConfig(DEFAULT_PLAN).freeUploadsPerDay;

/** Maximum Sparks a user can earn per day via eligible uploads. */
export const DAILY_SPARK_EARNING_CAP = 10;

/** Sparks rewarded per eligible Snap upload. */
export const SPARK_PER_UPLOAD_REWARD = 1;

/** Sparks cost for an extra Snap upload on the FREE plan (see PLAN_CONFIG). */
export const EXTRA_UPLOAD_COST_SPARKS = getPlanConfig(DEFAULT_PLAN).extraUploadCost;

/** Sparks cost for a caption edit on the FREE plan (see PLAN_CONFIG). */
export const CAPTION_EDIT_COST_SPARKS = getPlanConfig(DEFAULT_PLAN).captionEditCost;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type SparkError =
  | "insufficient_sparks"
  | "daily_upload_limit_reached"
  | "daily_earning_cap_reached"
  | "duplicate_request"
  | "invalid_operation"
  | "unauthorized";

export class SparkServiceError extends Error {
  constructor(
    public readonly code: SparkError,
    message: string,
  ) {
    super(message);
    this.name = "SparkServiceError";
  }
}

// ---------------------------------------------------------------------------
// Daily period helpers (Asia/Yangon)
// ---------------------------------------------------------------------------

/**
 * Compute the UTC start/end boundaries for "today" in Asia/Yangon.
 *
 * Yangon is UTC+6:30, so midnight Yangon = 17:30 UTC previous day.
 * The function reuses the same `toLocaleString` + UTC calculation pattern
 * found in `lib/notifications/notification-service.ts` and
 * `lib/birthday-notifications.ts`.
 */
export function getDailyPeriodBoundaries(now: Date = new Date()): {
  dayStart: Date;
  dayEnd: Date;
} {
  const yangonToday = new Date(
    now.toLocaleString("en-US", { timeZone: APP_TIMEZONE }),
  );
  const year = yangonToday.getFullYear();
  const month = yangonToday.getMonth();
  const day = yangonToday.getDate();

  const yangonMidnight = new Date(Date.UTC(year, month, day, 0, 0, 0));
  const dayStart = new Date(
    yangonMidnight.getTime() - YANGON_OFFSET_HOURS * 60 * 60 * 1000,
  );
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  return { dayStart, dayEnd };
}

/**
 * Get the Yangon midnight date (date-only, no time) for the given instant.
 * Used as the `day` key in DailyUploadCounter.
 */
export function getYangonDayDate(now: Date = new Date()): Date {
  const yangonToday = new Date(
    now.toLocaleString("en-US", { timeZone: APP_TIMEZONE }),
  );
  return new Date(
    Date.UTC(
      yangonToday.getFullYear(),
      yangonToday.getMonth(),
      yangonToday.getDate(),
      0,
      0,
      0,
    ),
  );
}

// ---------------------------------------------------------------------------
// Balance queries
// ---------------------------------------------------------------------------

export interface SparkBalance {
  total: number;
  earned: number;
  subscription: number;
}

/**
 * Compute the user's available Spark balance from the ledger.
 *
 * Only non-expired transactions are counted. Positive amounts are credits,
 * negative amounts are debits. This distinguishes Earned Sparks (never
 * expire), active Subscription Sparks (within their billing period), and
 * expired Subscription Sparks (excluded — never available, never negative).
 */
export async function getSparkBalance(
  userId: string,
  now: Date = new Date(),
): Promise<SparkBalance> {
  const rows = await prisma.sparkTransaction.groupBy({
    by: ["sparkKind"],
    where: {
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    _sum: { amount: true },
  });

  let earned = 0;
  let subscription = 0;

  for (const row of rows) {
    const sum = row._sum.amount ?? 0;
    if (row.sparkKind === "EARNED") {
      earned = sum;
    } else if (row.sparkKind === "SUBSCRIPTION") {
      subscription = sum;
    }
  }

  return {
    total: earned + subscription,
    earned,
    subscription,
  };
}

// ---------------------------------------------------------------------------
// Daily usage queries (read-only, for display purposes)
// ---------------------------------------------------------------------------

export interface DailyUploadUsage {
  /** Number of free uploads used today. */
  freeUploadsUsed: number;
  /** Number of Spark-paid uploads used today. */
  sparkUploadsUsed: number;
  /** Total uploads today (free + paid). */
  totalUploads: number;
  /** Remaining free uploads today (0 or positive). */
  freeUploadsRemaining: number;
  /** Whether the daily upload limit has been reached (all 10 used). */
  dailyLimitReached: boolean;
}

/**
 * Get the user's upload usage for the current daily period.
 *
 * Free upload count comes from the atomic DailyUploadCounter (source of truth).
 * Spark-paid count comes from UploadUsage records. The daily allowance is
 * plan-aware: the server resolves the user's effective plan and applies that
 * plan's `freeUploadsPerDay` from PLAN_CONFIG.
 */
export async function getDailyUploadUsage(
  userId: string,
  now: Date = new Date(),
): Promise<DailyUploadUsage> {
  const yangonDay = getYangonDayDate(now);
  const { dayStart, dayEnd } = getDailyPeriodBoundaries(now);

  const [subscription, counter, paidUsages] = await Promise.all([
    getSubscription(userId),
    prisma.dailyUploadCounter.findUnique({
      where: { userId_day: { userId, day: yangonDay } },
      select: { count: true },
    }),
    prisma.uploadUsage.findMany({
      where: {
        userId,
        isFree: false,
        createdAt: { gte: dayStart, lt: dayEnd },
      },
      select: { id: true },
    }),
  ]);

  const planConfig = getPlanConfig(resolveEffectivePlan(subscription, now));
  const freeUploadsUsed = counter?.count ?? 0;
  const sparkUploadsUsed = paidUsages.length;
  const totalUploads = freeUploadsUsed + sparkUploadsUsed;
  const freeUploadsRemaining = Math.max(
    0,
    planConfig.freeUploadsPerDay - freeUploadsUsed,
  );

  return {
    freeUploadsUsed,
    sparkUploadsUsed,
    totalUploads,
    freeUploadsRemaining,
    dailyLimitReached: freeUploadsUsed >= planConfig.freeUploadsPerDay,
  };
}

export interface DailySparkUsage {
  /** Sparks earned today. */
  sparksEarnedToday: number;
  /** Remaining earning capacity today (0 or positive). */
  earningCapRemaining: number;
  /** Whether the daily earning cap has been reached. */
  earningCapReached: boolean;
}

/**
 * Get the user's Spark earning usage for the current daily period.
 */
export async function getDailySparkUsage(
  userId: string,
  now: Date = new Date(),
): Promise<DailySparkUsage> {
  const { dayStart, dayEnd } = getDailyPeriodBoundaries(now);

  const result = await prisma.sparkTransaction.aggregate({
    where: {
      userId,
      type: "UPLOAD_REWARD",
      createdAt: { gte: dayStart, lt: dayEnd },
    },
    _sum: { amount: true },
  });

  const sparksEarnedToday = result._sum.amount ?? 0;
  const earningCapRemaining = Math.max(
    0,
    DAILY_SPARK_EARNING_CAP - sparksEarnedToday,
  );

  return {
    sparksEarnedToday,
    earningCapRemaining,
    earningCapReached: sparksEarnedToday >= DAILY_SPARK_EARNING_CAP,
  };
}

// ---------------------------------------------------------------------------
// Usage summary (S2 — server-authoritative presentation projection)
// ---------------------------------------------------------------------------

/**
 * Build the read-only Spark usage summary the upload UI renders.
 * Every value is derived from the authoritative ledger + daily counters +
 * the server-resolved subscription state — nothing here is computed or
 * trusted on the client. Contains no ledger internals (no transaction ids,
 * sources, or history).
 *
 * Plan-aware (S4): costs, daily allowance, plan identity, subscription
 * Sparks, earned Sparks, and the billing-period end all reflect the user's
 * effective plan resolved server-side.
 */
export async function getSparkUsageSummary(
  userId: string,
  now: Date = new Date(),
): Promise<SparkUsageSummary> {
  const [balance, uploadUsage, sparkUsage, subscription] = await Promise.all([
    getSparkBalance(userId),
    getDailyUploadUsage(userId, now),
    getDailySparkUsage(userId, now),
    getSubscription(userId),
  ]);

  const plan = resolveEffectivePlan(subscription, now);
  const planConfig = getPlanConfig(plan);
  const subscriptionPeriodEnd =
    subscription && isSubscriptionActive(subscription, now)
      ? subscription.currentPeriodEnd.toISOString()
      : null;

  const nextUploadIsPaid = uploadUsage.freeUploadsRemaining <= 0;

  return {
    balance: balance.total,
    plan,
    subscriptionSparks: balance.subscription,
    earnedSparks: balance.earned,
    subscriptionPeriodEnd,
    freeUploadsUsed: uploadUsage.freeUploadsUsed,
    freeUploadsRemaining: uploadUsage.freeUploadsRemaining,
    freeDailyUploads: planConfig.freeUploadsPerDay,
    dailyEarnedSparks: sparkUsage.sparksEarnedToday,
    dailyEarnRemaining: sparkUsage.earningCapRemaining,
    dailyEarningCap: DAILY_SPARK_EARNING_CAP,
    extraUploadCost: planConfig.extraUploadCost,
    captionEditCost: planConfig.captionEditCost,
    canAffordCaptionEdit: balance.total >= planConfig.captionEditCost,
    uploadReward: SPARK_PER_UPLOAD_REWARD,
    nextUploadIsPaid,
    canAffordNextUpload:
      !nextUploadIsPaid || balance.total >= planConfig.extraUploadCost,
  };
}

// ---------------------------------------------------------------------------
// Atomic daily counter helpers (used inside Prisma transactions)
// ---------------------------------------------------------------------------

/**
 * Atomically increment the daily free-upload counter for a user.
 *
 * Uses SELECT ... FOR UPDATE (via Prisma interactive transaction) to prevent
 * concurrent requests from consuming the same free slot.
 *
 * Must be called inside a Prisma interactive transaction (`tx`).
 * Returns the NEW count after increment, or null if the limit is reached.
 *
 * @param tx - Prisma transaction client
 * @param userId - The uploading user
 * @param now - Current time for Yangon day calculation
 * @param freeLimit - Maximum free uploads per day (default: 10)
 */
export async function incrementDailyUploadCounter(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date,
  freeLimit: number = FREE_DAILY_UPLOADS,
): Promise<{ newCount: number } | null> {
  const yangonDay = getYangonDayDate(now);

  // Ensure the counter row exists (idempotent).
  await tx.dailyUploadCounter.upsert({
    where: { userId_day: { userId, day: yangonDay } },
    create: { userId, day: yangonDay, count: 0 },
    update: {},
    select: { id: true },
  });

  // Lock the row and atomically increment if under the limit.
  const rows = await tx.$queryRaw<
    Array<{ count: number }>
  >`UPDATE "daily_upload_counters"
     SET "count" = "count" + 1, "updatedAt" = NOW()
     WHERE "userId" = ${userId}
       AND "day" = ${yangonDay}
       AND "count" < ${freeLimit}
     RETURNING "count"`;

  if (rows.length === 0) {
    return null; // Limit reached
  }

  return { newCount: rows[0].count };
}

/**
 * Atomically increment the daily Spark-earning counter for a user.
 *
 * Uses UPDATE ... WHERE count < limit (analogous to DailyUploadCounter)
 * to prevent concurrent requests from exceeding the 10-Spark daily cap.
 *
 * Must be called inside a Prisma interactive transaction (`tx`).
 * Returns the NEW count after increment, or null if the cap is reached.
 *
 * @param tx - Prisma transaction client
 * @param userId - The uploading user
 * @param now - Current time for Yangon day calculation
 * @param cap - Maximum Sparks earnable per day (default: 10)
 */
export async function incrementDailySparkEarnCounter(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date,
  cap: number = DAILY_SPARK_EARNING_CAP,
): Promise<{ newCount: number } | null> {
  const yangonDay = getYangonDayDate(now);

  // Ensure the counter row exists (idempotent).
  await tx.dailySparkEarnCounter.upsert({
    where: { userId_day: { userId, day: yangonDay } },
    create: { userId, day: yangonDay, count: 0 },
    update: {},
    select: { id: true },
  });

  // Lock the row and atomically increment if under the cap.
  const rows = await tx.$queryRaw<
    Array<{ count: number }>
  >`UPDATE "daily_spark_earn_counters"
     SET "count" = "count" + 1, "updatedAt" = NOW()
     WHERE "userId" = ${userId}
       AND "day" = ${yangonDay}
       AND "count" < ${cap}
     RETURNING "count"`;

  if (rows.length === 0) {
    return null; // Cap reached
  }

  return { newCount: rows[0].count };
}

/**
 * Create a Spark reward transaction inside a Prisma transaction.
 *
 * The caller must have already incremented the daily earn counter
 * (which enforces the cap atomically). This function only inserts
 * the ledger entry.
 *
 * Must be called inside a Prisma interactive transaction (`tx`).
 */
export async function createSparkReward(
  tx: Prisma.TransactionClient,
  userId: string,
  snapId: string,
): Promise<{ transactionId: string }> {
  const transaction = await tx.sparkTransaction.create({
    data: {
      userId,
      amount: SPARK_PER_UPLOAD_REWARD,
      type: "UPLOAD_REWARD",
      source: "SNAP",
      sparkKind: "EARNED",
      referenceType: "snap",
      referenceId: snapId,
      metadata: { action: "upload_reward" },
    },
  });

  return { transactionId: transaction.id };
}

/**
 * Atomically spend Sparks inside a Prisma transaction (S4 — plan-aware).
 *
 * - SELECT ... FOR UPDATE on the canonical user row serializes all spends,
 *   so concurrent spends can never overspend or go negative.
 * - The cost is resolved server-side from the user's EFFECTIVE PLAN
 *   (PLAN_CONFIG) — the client never supplies a plan or an amount.
 * - Spending priority: subscription Sparks first, then earned Sparks. The
 *   debit is split into one ledger row per Spark kind under the same logical
 *   reference, so per-kind balances stay exact and the ledger remains the
 *   single source of truth.
 * - The subscription debit inherits `expiresAt` from the subscription Sparks
 *   it draws from, so grant and debit expire together at the billing-period
 *   boundary (expired pool → zero residue, never negative).
 * - Idempotent under the lock: a concurrent request with the same reference
 *   that already committed returns the original charge.
 *
 * Must be called inside a Prisma interactive transaction (`tx`).
 *
 * @returns The debit transaction record(s), or throws SparkServiceError.
 */
export async function atomicSpendSparks(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    type: "EXTRA_SNAP_UPLOAD" | "CAPTION_EDIT";
    referenceId: string;
    reason?: string;
  },
): Promise<{
  transactionId: string;
  amountDeducted: number;
  subscriptionPortion: number;
  earnedPortion: number;
  /** True when a concurrent request already charged this reference. */
  idempotent: boolean;
}> {
  const { userId, type, referenceId, reason } = input;
  const now = new Date();

  // Lock the canonical user row first. PostgreSQL does not lock aggregate
  // input rows with a plain SUM query, so this serializes all user spends.
  await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;

  // Idempotency re-check under the lock: a concurrent request with the same
  // logical reference may have committed while we waited for the lock.
  const existing = await tx.sparkTransaction.findMany({
    where: { userId, type, referenceId },
    select: { id: true, sparkKind: true, amount: true, metadata: true },
  });
  if (existing.length > 0) {
    const meta = existing[0].metadata as Record<string, unknown> | null;
    return {
      transactionId:
        existing.find((row) => row.sparkKind === "SUBSCRIPTION")?.id ??
        existing[0].id,
      amountDeducted: existing.reduce(
        (sum, row) => sum + Math.abs(row.amount),
        0,
      ),
      subscriptionPortion: Number(meta?.subscriptionPortion ?? 0),
      earnedPortion: Number(meta?.earnedPortion ?? 0),
      idempotent: true,
    };
  }

  // Server-authoritative cost: resolve the user's effective plan.
  const subscription = await getSubscription(userId, tx);
  const plan = resolveEffectivePlan(subscription, now);
  const planConfig = getPlanConfig(plan);

  let cost: number;
  switch (type) {
    case "EXTRA_SNAP_UPLOAD":
      cost = planConfig.extraUploadCost;
      break;
    case "CAPTION_EDIT":
      cost = planConfig.captionEditCost;
      break;
    default:
      throw new SparkServiceError(
        "invalid_operation",
        `Unknown spend type: ${type}`,
      );
  }

  // Sum subscription Sparks (non-expired) while holding the user lock.
  // MAX(expiresAt) is the billing-period boundary of the pool this spend
  // draws from — the subscription debit is tied to the same boundary.
  const subRows = await tx.$queryRaw<
    Array<{ total: bigint; expiresAt: Date | null }>
  >`SELECT COALESCE(SUM("amount"), 0) AS total, MAX("expiresAt") AS "expiresAt"
     FROM "spark_transactions"
     WHERE "userId" = ${userId}
       AND "sparkKind" = 'SUBSCRIPTION'
       AND ("expiresAt" IS NULL OR "expiresAt" > NOW())`;

  const subscriptionBalance = Number(
    subRows[0]?.total ?? BigInt(0),
  );
  const subscriptionExpiresAt = subRows[0]?.expiresAt ?? null;

  // Lock and sum earned Sparks (non-expired).
  const earnedRows = await tx.$queryRaw<
    Array<{ total: bigint }>
  >`SELECT COALESCE(SUM("amount"), 0) AS total
     FROM "spark_transactions"
     WHERE "userId" = ${userId}
       AND "sparkKind" = 'EARNED'
       AND ("expiresAt" IS NULL OR "expiresAt" > NOW())`;

  const earnedBalance = Number(earnedRows[0]?.total ?? BigInt(0));

  const totalBalance = subscriptionBalance + earnedBalance;

  if (totalBalance < cost) {
    throw new SparkServiceError(
      "insufficient_sparks",
      `Insufficient Sparks: have ${totalBalance}, need ${cost}`,
    );
  }

  // Priority: subscription first, then earned.
  const subscriptionPortion = Math.min(cost, subscriptionBalance);
  const earnedPortion = cost - subscriptionPortion;

  const metadata = {
    reason: reason ?? type,
    plan,
    subscriptionPortion,
    earnedPortion,
  };

  // One debit row per Spark kind under the same logical reference, so both
  // per-kind balances stay exact. Zero portions create no row.
  let subscriptionDebitId: string | null = null;
  if (subscriptionPortion > 0) {
    const debit = await tx.sparkTransaction.create({
      data: {
        userId,
        amount: -subscriptionPortion,
        type,
        source: "SNAP",
        sparkKind: "SUBSCRIPTION",
        expiresAt: subscriptionExpiresAt,
        referenceType: "snap",
        referenceId,
        metadata,
      },
    });
    subscriptionDebitId = debit.id;
  }

  let earnedDebitId: string | null = null;
  if (earnedPortion > 0) {
    const debit = await tx.sparkTransaction.create({
      data: {
        userId,
        amount: -earnedPortion,
        type,
        source: "SNAP",
        sparkKind: "EARNED",
        expiresAt: null,
        referenceType: "snap",
        referenceId,
        metadata,
      },
    });
    earnedDebitId = debit.id;
  }

  return {
    transactionId: subscriptionDebitId ?? earnedDebitId as string,
    amountDeducted: cost,
    subscriptionPortion,
    earnedPortion,
    idempotent: false,
  };
}

// ---------------------------------------------------------------------------
// High-level earning
// ---------------------------------------------------------------------------

export interface EarnSparksInput {
  userId: string;
  snapId: string;
}

export interface EarnSparksResult {
  ok: true;
  /** Whether a Spark was actually credited (false if daily cap reached). */
  credited: boolean;
  /** The Spark transaction created, or null if no Spark was credited. */
  transactionId: string | null;
}

/**
 * Credit +1 Spark for an eligible Snap upload.
 *
 * - Idempotent: calling with the same snapId twice is safe (returns existing).
 * - Enforces daily earning cap of 10 Sparks.
 * - Spark-paid uploads (not free) do NOT earn Sparks.
 *
 * Must be called only for uploads that qualify for a reward (free uploads).
 * This function is NOT inside the route transaction — it manages its own
 * transaction for the cap check + reward creation.
 */
export async function earnSparks(
  input: EarnSparksInput,
  now: Date = new Date(),
): Promise<EarnSparksResult> {
  const { userId, snapId } = input;

  const existing = await prisma.sparkTransaction.findFirst({
    where: {
      userId,
      type: "UPLOAD_REWARD",
      referenceId: snapId,
    },
    select: { id: true },
  });
  if (existing) {
    return { ok: true, credited: false, transactionId: existing.id };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // The counter row is the serialized daily-cap authority. The counter
      // increment and reward insert share this transaction and roll back
      // together if the unique reward insert loses a concurrent race.
      const rewardSlot = await incrementDailySparkEarnCounter(tx, userId, now);
      if (!rewardSlot) {
        return { credited: false, transactionId: null as string | null };
      }

      const transaction = await tx.sparkTransaction.create({
        data: {
          userId,
          amount: SPARK_PER_UPLOAD_REWARD,
          type: "UPLOAD_REWARD",
          source: "SNAP",
          sparkKind: "EARNED",
          referenceType: "snap",
          referenceId: snapId,
          metadata: { action: "upload_reward" },
        },
      });

      return { credited: true, transactionId: transaction.id };
    });

    return { ok: true, ...result };
  } catch (error) {
    // Concurrent same-snap calls can race after the initial read. The unique
    // ledger constraint makes one winner; the loser returns that transaction.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const concurrent = await prisma.sparkTransaction.findFirst({
        where: {
          userId,
          type: "UPLOAD_REWARD",
          referenceId: snapId,
        },
        select: { id: true },
      });
      if (concurrent) {
        return { ok: true, credited: false, transactionId: concurrent.id };
      }
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// High-level spending
// ---------------------------------------------------------------------------

export interface SpendSparksInput {
  userId: string;
  /** The action triggering the spend. */
  type: "EXTRA_SNAP_UPLOAD" | "CAPTION_EDIT";
  /** Stable reference to prevent duplicate spends. */
  referenceId: string;
  /** Human-readable reason for metadata. */
  reason?: string;
}

export interface SpendSparksResult {
  ok: true;
  /** Whether this was an idempotent replay (no new charge). */
  idempotent: boolean;
  /** Amount actually deducted (same on idempotent replay for caller convenience). */
  amountDeducted: number;
  /** How much was taken from subscription Sparks (0 on idempotent replay). */
  subscriptionPortion: number;
  /** How much was taken from earned Sparks (0 on idempotent replay). */
  earnedPortion: number;
  transactionId: string;
}

/**
 * Spend Sparks for an action (extra upload or caption edit).
 *
 * Priority: subscription Sparks are consumed first, then earned Sparks.
 * The cost comes from the server-resolved effective plan (PLAN_CONFIG) —
 * never from the client. Idempotent: calling with the same
 * referenceId/type is safe, including for a spend split across both
 * Spark kinds.
 *
 * Uses a Prisma interactive transaction with row-level locking to prevent
 * concurrent overspending.
 */
export async function spendSparks(
  input: SpendSparksInput,
): Promise<SpendSparksResult> {
  const { userId, type, referenceId, reason } = input;

  // Validate the operation type. The cost itself is resolved inside
  // atomicSpendSparks from the user's effective plan.
  switch (type) {
    case "EXTRA_SNAP_UPLOAD":
    case "CAPTION_EDIT":
      break;
    default:
      throw new SparkServiceError(
        "invalid_operation",
        `Unknown spend type: ${type}`,
      );
  }

  // Check for existing spend (idempotency across both Spark kinds).
  const existing = await prisma.sparkTransaction.findMany({
    where: { userId, type, referenceId },
    select: { id: true, sparkKind: true, amount: true, metadata: true },
    orderBy: { createdAt: "asc" },
  });

  if (existing.length > 0) {
    // Already spent — idempotent success.
    // Return the original split from metadata for caller visibility.
    const meta = existing[0].metadata as Record<string, unknown> | null;
    return {
      ok: true,
      idempotent: true,
      amountDeducted: existing.reduce(
        (sum, row) => sum + Math.abs(row.amount),
        0,
      ),
      subscriptionPortion: Number(meta?.subscriptionPortion ?? 0),
      earnedPortion: Number(meta?.earnedPortion ?? 0),
      transactionId:
        existing.find((row) => row.sparkKind === "SUBSCRIPTION")?.id ??
        existing[0].id,
    };
  }

  // Atomic spend with pessimistic locking.
  const spendResult = await prisma.$transaction(async (tx) => {
    return atomicSpendSparks(tx, {
      userId,
      type,
      referenceId,
      reason,
    });
  });

  return {
    ok: true,
    idempotent: spendResult.idempotent,
    amountDeducted: spendResult.amountDeducted,
    subscriptionPortion: spendResult.subscriptionPortion,
    earnedPortion: spendResult.earnedPortion,
    transactionId: spendResult.transactionId,
  };
}

// ---------------------------------------------------------------------------
// Transaction history
// ---------------------------------------------------------------------------

export interface SparkTransactionRow {
  id: string;
  amount: number;
  type: SparkTransactionType;
  source: SparkTransactionSource;
  sparkKind: SparkKind;
  expiresAt: Date | null;
  referenceType: string | null;
  referenceId: string;
  metadata: unknown;
  createdAt: Date;
}

export interface GetSparkTransactionsInput {
  userId: string;
  limit?: number;
  cursor?: string;
}

/**
 * Fetch the user's Spark transaction history, newest first.
 * Supports keyset pagination via cursor (the transaction id).
 */
export async function getSparkTransactions(
  input: GetSparkTransactionsInput,
): Promise<{
  transactions: SparkTransactionRow[];
  nextCursor: string | null;
}> {
  const { userId, limit = 20, cursor } = input;

  const transactions = await prisma.sparkTransaction.findMany({
    where: {
      userId,
      ...(cursor
        ? {
            createdAt: { lt: await getCursorCreatedAt(cursor) },
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true,
      amount: true,
      type: true,
      source: true,
      sparkKind: true,
      expiresAt: true,
      referenceType: true,
      referenceId: true,
      metadata: true,
      createdAt: true,
    },
  });

  let nextCursor: string | null = null;
  if (transactions.length > limit) {
    const next = transactions.pop()!;
    nextCursor = next.id;
  }

  return { transactions, nextCursor };
}

async function getCursorCreatedAt(cursorId: string): Promise<Date> {
  const cursor = await prisma.sparkTransaction.findUnique({
    where: { id: cursorId },
    select: { createdAt: true },
  });
  if (!cursor) {
    throw new SparkServiceError("invalid_operation", "Invalid cursor");
  }
  return cursor.createdAt;
}

// ---------------------------------------------------------------------------
// Upload usage tracking (non-atomic, called inside route transaction)
// ---------------------------------------------------------------------------

/**
 * Record an upload usage entry. Called when a Snap is created.
 *
 * Must be called inside the same Prisma transaction as snap creation
 * to ensure atomicity.
 */
export async function recordUploadUsage(
  tx: Prisma.TransactionClient,
  userId: string,
  snapId: string,
  isFree: boolean,
): Promise<void> {
  await tx.uploadUsage.create({
    data: {
      userId,
      snapId,
      isFree,
    },
  });
}
