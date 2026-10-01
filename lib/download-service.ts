import { prisma } from "@/lib/prisma";
import {
  SPARK_DOWNLOAD_COST,
  SparkServiceError,
  atomicSpendSparks,
  getYangonDayDate,
} from "@/lib/spark-service";
import type {
  DownloadAuthorizationDecision,
  DownloadUsageSnapshot,
} from "@/lib/download-authorization";
import type { Prisma } from "@prisma/client";

/**
 * Free Snap downloads per user per Asia/Yangon calendar day.
 */
export const FREE_DAILY_DOWNLOADS = 3;

export interface DailyDownloadUsage {
  /** Number of free downloads used today (in Asia/Yangon day). */
  freeDownloadsUsed: number;
  /** Number of free downloads remaining today (in Asia/Yangon day). */
  freeDownloadsRemaining: number;
  /** Maximum free downloads allowed per day (3). */
  freeDailyDownloads: number;
  /** Whether the free allowance for today is exhausted. */
  isFreeExhausted: boolean;
  /** The Yangon calendar day (midnight UTC instant) for this usage period. */
  yangonDay: Date;
}

export type ConsumeFreeDownloadResult =
  | {
      consumed: true;
      freeDownloadsUsed: number;
      freeDownloadsRemaining: number;
      freeDailyDownloads: number;
      isFreeExhausted: boolean;
    }
  | {
      consumed: false;
      freeDownloadsUsed: number;
      freeDownloadsRemaining: 0;
      freeDailyDownloads: number;
      isFreeExhausted: true;
      reason: "allowance_exhausted";
    };

/**
 * Read the user's daily free-download usage with the provided client
 * (the global client or an interactive transaction, so uncommitted state
 * stays visible inside `authorizeDownload`).
 */
async function readDailyDownloadUsage(
  client: Prisma.TransactionClient,
  userId: string,
  now: Date,
): Promise<DailyDownloadUsage> {
  const yangonDay = getYangonDayDate(now);

  const counter = await client.dailyDownloadCounter.findUnique({
    where: { userId_day: { userId, day: yangonDay } },
    select: { count: true },
  });

  const used = Math.min(counter?.count ?? 0, FREE_DAILY_DOWNLOADS);
  const remaining = Math.max(0, FREE_DAILY_DOWNLOADS - used);

  return {
    freeDownloadsUsed: used,
    freeDownloadsRemaining: remaining,
    freeDailyDownloads: FREE_DAILY_DOWNLOADS,
    isFreeExhausted: remaining === 0,
    yangonDay,
  };
}

/** API projection: usage without the internal Yangon day key. */
function toUsageSnapshot(usage: DailyDownloadUsage): DownloadUsageSnapshot {
  return {
    freeDownloadsUsed: usage.freeDownloadsUsed,
    freeDownloadsRemaining: usage.freeDownloadsRemaining,
    freeDailyDownloads: usage.freeDailyDownloads,
    isFreeExhausted: usage.isFreeExhausted,
  };
}

/**
 * Get the user's current daily free download usage for today (Asia/Yangon).
 *
 * Server-authoritative: reads the current count from `DailyDownloadCounter`.
 * If no record exists for today, 0 downloads have been used.
 *
 * @param userId - The authenticated user ID
 * @param now - Optional reference date (defaults to current time)
 */
export async function getDailyDownloadUsage(
  userId: string,
  now: Date = new Date(),
): Promise<DailyDownloadUsage> {
  return readDailyDownloadUsage(prisma, userId, now);
}

/**
 * Atomically increment the daily download counter inside an interactive transaction (`tx`).
 *
 * Uses `UPDATE "daily_download_counters" ... WHERE "count" < freeLimit RETURNING "count"`
 * to prevent concurrent requests from exceeding the free limit.
 *
 * Returns `{ newCount }` if successfully incremented under the limit,
 * or `null` if the limit was already reached or exceeded.
 */
export async function incrementDailyDownloadCounter(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date = new Date(),
  freeLimit: number = FREE_DAILY_DOWNLOADS,
): Promise<{ newCount: number } | null> {
  const yangonDay = getYangonDayDate(now);

  // Ensure the counter row exists for today (idempotent upsert).
  await tx.dailyDownloadCounter.upsert({
    where: { userId_day: { userId, day: yangonDay } },
    create: { userId, day: yangonDay, count: 0 },
    update: {},
    select: { id: true },
  });

  // Atomically increment if strictly under the free limit.
  const rows = await tx.$queryRaw<
    Array<{ count: number }>
  >`UPDATE "daily_download_counters"
     SET "count" = "count" + 1, "updatedAt" = NOW()
     WHERE "userId" = ${userId}
       AND "day" = ${yangonDay}
       AND "count" < ${freeLimit}
     RETURNING "count"`;

  if (rows.length === 0) {
    return null; // Free allowance reached
  }

  return { newCount: rows[0].count };
}

/**
 * Attempt to consume one free download for the given user.
 *
 * Runs inside an atomic transaction:
 * - If the user has free downloads remaining (< 3), increments count by 1 and returns `consumed: true`.
 * - If the user has already consumed 3 free downloads, returns `consumed: false` with `reason: "allowance_exhausted"`.
 *
 * Concurrency safe: simultaneous requests cannot race to over-consume the free allowance.
 *
 * @param userId - The authenticated user ID
 * @param now - Optional reference date (defaults to current time)
 */
export async function consumeFreeDownload(
  userId: string,
  now: Date = new Date(),
): Promise<ConsumeFreeDownloadResult> {
  return prisma.$transaction(async (tx) => {
    const result = await incrementDailyDownloadCounter(
      tx,
      userId,
      now,
      FREE_DAILY_DOWNLOADS,
    );

    if (result) {
      const remaining = Math.max(0, FREE_DAILY_DOWNLOADS - result.newCount);
      return {
        consumed: true,
        freeDownloadsUsed: result.newCount,
        freeDownloadsRemaining: remaining,
        freeDailyDownloads: FREE_DAILY_DOWNLOADS,
        isFreeExhausted: remaining === 0,
      };
    }

    // Free limit reached or exceeded; read current count for response
    const yangonDay = getYangonDayDate(now);
    const current = await tx.dailyDownloadCounter.findUnique({
      where: { userId_day: { userId, day: yangonDay } },
      select: { count: true },
    });

    const used = current?.count ?? FREE_DAILY_DOWNLOADS;

    return {
      consumed: false,
      freeDownloadsUsed: used,
      freeDownloadsRemaining: 0,
      freeDailyDownloads: FREE_DAILY_DOWNLOADS,
      isFreeExhausted: true,
      reason: "allowance_exhausted",
    };
  });
}

/**
 * Authorize and account for ONE Snap download (D3).
 *
 * Server-authoritative flow, executed in a single Prisma transaction:
 *
 * 1. Try to consume a free allowance slot (`UPDATE ... WHERE count < 3` —
 *    concurrency-safe). If it succeeds the download is FREE.
 * 2. Otherwise the free allowance is exhausted:
 *    - without `confirmed` → `SPARK_REQUIRED` (the client must show the
 *      confirmation UI; nothing is charged),
 *    - with `confirmed` → debit exactly `SPARK_DOWNLOAD_COST` (1 Spark)
 *      through the existing Spark ledger (`atomicSpendSparks`, type
 *      `SNAP_DOWNLOAD`, `referenceId` = the caller's idempotency key).
 * 3. Insufficient balance → transaction rolls back; no Spark moves and the
 *    caller receives `INSUFFICIENT_SPARKS`.
 *
 * The client never supplies a user id or a count — identity comes from the
 * authenticated session at the API boundary.
 *
 * Idempotency follows the existing ledger convention: the same
 * `referenceId` under (user, type) replays as `idempotent: true` without a
 * second charge, so retried confirmations can never double-charge.
 */
export async function authorizeDownload(
  userId: string,
  input: {
    /** Stable key for this logical download; becomes the Spark referenceId. */
    idempotencyKey: string;
    /** True only after the user explicitly confirmed the Spark cost. */
    confirmed?: boolean;
    now?: Date;
  },
): Promise<DownloadAuthorizationDecision> {
  const now = input.now ?? new Date();
  const confirmed = input.confirmed === true;
  const idempotencyKey = input.idempotencyKey.trim();

  if (confirmed && idempotencyKey.length === 0) {
    throw new Error("idempotency key is required for a Spark-paid download");
  }

  try {
    return await prisma.$transaction(
      async (tx): Promise<DownloadAuthorizationDecision> => {
        // 1) Free allowance first — atomic conditional increment.
        const free = await incrementDailyDownloadCounter(
          tx,
          userId,
          now,
          FREE_DAILY_DOWNLOADS,
        );

        if (free) {
          const remaining = Math.max(0, FREE_DAILY_DOWNLOADS - free.newCount);
          return {
            authorized: true,
            mode: "FREE",
            freeDownloadsUsed: free.newCount,
            freeDownloadsRemaining: remaining,
            freeDailyDownloads: FREE_DAILY_DOWNLOADS,
            isFreeExhausted: remaining === 0,
          };
        }

        // 2) Free allowance exhausted — Spark-paid path requires confirmation.
        if (!confirmed) {
          const usage = await readDailyDownloadUsage(tx, userId, now);
          return {
            authorized: false,
            reason: "SPARK_REQUIRED",
            sparkCost: SPARK_DOWNLOAD_COST,
            ...toUsageSnapshot(usage),
          };
        }

        // 3) Debit exactly 1 Spark via the existing ledger (locks the user
        //    row, resolves plan/balance, idempotent on (user, type, key)).
        const spend = await atomicSpendSparks(tx, {
          userId,
          type: "SNAP_DOWNLOAD",
          referenceId: idempotencyKey,
          reason: "Snap download",
        });

        const usage = await readDailyDownloadUsage(tx, userId, now);
        return {
          authorized: true,
          mode: "SPARK",
          sparkCost: SPARK_DOWNLOAD_COST,
          sparkSpent: spend.amountDeducted,
          idempotent: spend.idempotent,
          ...toUsageSnapshot(usage),
        };
      },
    );
  } catch (error) {
    if (
      error instanceof SparkServiceError &&
      error.code === "insufficient_sparks"
    ) {
      // Transaction rolled back: no Spark moved, no free slot consumed.
      return {
        authorized: false,
        reason: "INSUFFICIENT_SPARKS",
        sparkCost: SPARK_DOWNLOAD_COST,
      };
    }
    throw error;
  }
}
