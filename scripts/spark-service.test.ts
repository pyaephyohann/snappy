/**
 * Spark Economy Service Tests (S1 — Foundation, hardened)
 *
 * Integration tests using Node built-in test runner + a real Postgres database.
 * Requires DATABASE_URL to be set; tests skip gracefully otherwise.
 *
 * Run: npm run test:spark
 */
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import {
  getSparkBalance,
  getDailyUploadUsage,
  getDailySparkUsage,
  earnSparks,
  spendSparks,
  recordUploadUsage,
  incrementDailyUploadCounter,
  incrementDailySparkEarnCounter,
  getSparkTransactions,
  getDailyPeriodBoundaries,
  getYangonDayDate,
  SparkServiceError,
  FREE_DAILY_UPLOADS,
  DAILY_SPARK_EARNING_CAP,
  SPARK_PER_UPLOAD_REWARD,
  EXTRA_UPLOAD_COST_SPARKS,
  CAPTION_EDIT_COST_SPARKS,
} from "../lib/spark-service";
import { createSnapWithSparkAccounting } from "../lib/snap-upload-service";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const prisma = new PrismaClient();
const hasDb = !!process.env.DATABASE_URL;

const testUserIds: string[] = [];
const testSnapIds: string[] = [];

async function createTestUser(name: string): Promise<string> {
  const user = await prisma.user.create({
    data: { name, profileImage: "https://example.com/test.jpg" },
  });
  testUserIds.push(user.id);
  return user.id;
}

async function createTestSnap(userId: string, uploaderId: string): Promise<string> {
  const snap = await prisma.snap.create({
    data: {
      userId,
      uploadedById: uploaderId,
      imageUrl: "https://res.cloudinary.com/test/image/upload/test.jpg",
      publicId: "test/test_snap",
    },
  });
  testSnapIds.push(snap.id);
  return snap.id;
}

async function seedSparkTransaction(opts: {
  userId: string;
  amount: number;
  type: "UPLOAD_REWARD" | "SUBSCRIPTION_GRANT" | "EXTRA_SNAP_UPLOAD" | "CAPTION_EDIT" | "SUBSCRIPTION_EXPIRATION" | "ADMIN_ADJUSTMENT" | "REFUND";
  source: "SNAP" | "SUBSCRIPTION" | "ADMIN";
  sparkKind: "EARNED" | "SUBSCRIPTION";
  expiresAt?: Date | null;
  referenceId?: string;
}) {
  return prisma.sparkTransaction.create({
    data: {
      userId: opts.userId,
      amount: opts.amount,
      type: opts.type,
      source: opts.source,
      sparkKind: opts.sparkKind,
      expiresAt: opts.expiresAt ?? null,
      referenceType: opts.referenceId ? "test" : null,
      referenceId: opts.referenceId ?? `test_${opts.type}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    },
  });
}

before(async () => {
  if (!hasDb) return;
  await prisma.sparkTransaction.deleteMany({});
  await prisma.uploadUsage.deleteMany({});
  await prisma.dailyUploadCounter.deleteMany({});
  await prisma.dailySparkEarnCounter.deleteMany({});
});

after(async () => {
  if (!hasDb) return;
  for (const snapId of testSnapIds) {
    await prisma.sparkTransaction.deleteMany({ where: { referenceId: snapId } });
    await prisma.uploadUsage.deleteMany({ where: { snapId } });
    await prisma.snap.delete({ where: { id: snapId } }).catch(() => {});
  }
  for (const userId of testUserIds) {
    await prisma.sparkTransaction.deleteMany({ where: { userId } });
    await prisma.uploadUsage.deleteMany({ where: { userId } });
    await prisma.dailyUploadCounter.deleteMany({ where: { userId } });
    await prisma.dailySparkEarnCounter.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

// ===========================================================================
// Daily period boundary tests
// ===========================================================================

test("getDailyPeriodBoundaries computes correct Yangon boundaries", () => {
  const now = new Date("2026-09-20T10:00:00Z");
  const { dayStart, dayEnd } = getDailyPeriodBoundaries(now);
  assert.equal(dayStart.toISOString(), "2026-09-19T17:30:00.000Z");
  assert.equal(dayEnd.toISOString(), "2026-09-20T17:30:00.000Z");
});

test("getDailyPeriodBoundaries handles midnight boundary", () => {
  const now = new Date("2026-09-19T17:30:00Z");
  const { dayStart, dayEnd } = getDailyPeriodBoundaries(now);
  assert.equal(dayStart.toISOString(), "2026-09-19T17:30:00.000Z");
  assert.equal(dayEnd.toISOString(), "2026-09-20T17:30:00.000Z");
});

test("getYangonDayDate returns date-only midnight UTC", () => {
  const now = new Date("2026-09-20T10:00:00Z"); // 16:30 Yangon
  const day = getYangonDayDate(now);
  assert.equal(day.toISOString(), "2026-09-19T17:30:00.000Z"); // midnight Yangon Sep 20
});

// ===========================================================================
// Balance tests
// ===========================================================================

test("getSparkBalance returns zero for new user", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_balance_zero");
  const balance = await getSparkBalance(userId);
  assert.equal(balance.total, 0);
  assert.equal(balance.earned, 0);
  assert.equal(balance.subscription, 0);
});

test("getSparkBalance correctly sums earned and subscription sparks", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_balance_sum");
  await seedSparkTransaction({ userId, amount: 5, type: "UPLOAD_REWARD", source: "SNAP", sparkKind: "EARNED", referenceId: "s_a" });
  await seedSparkTransaction({ userId, amount: 3, type: "UPLOAD_REWARD", source: "SNAP", sparkKind: "EARNED", referenceId: "s_b" });
  await seedSparkTransaction({ userId, amount: 10, type: "SUBSCRIPTION_GRANT", source: "SUBSCRIPTION", sparkKind: "SUBSCRIPTION", referenceId: "sub_s" });
  await seedSparkTransaction({ userId, amount: -2, type: "CAPTION_EDIT", source: "SNAP", sparkKind: "EARNED", referenceId: "s_c_edit" });

  const balance = await getSparkBalance(userId);
  assert.equal(balance.earned, 6);
  assert.equal(balance.subscription, 10);
  assert.equal(balance.total, 16);
});

test("getSparkBalance excludes expired subscription sparks", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_balance_exp");
  await seedSparkTransaction({ userId, amount: 50, type: "SUBSCRIPTION_GRANT", source: "SUBSCRIPTION", sparkKind: "SUBSCRIPTION", expiresAt: new Date("2026-08-01T00:00:00Z"), referenceId: "sub_aug" });
  await seedSparkTransaction({ userId, amount: 30, type: "SUBSCRIPTION_GRANT", source: "SUBSCRIPTION", sparkKind: "SUBSCRIPTION", expiresAt: new Date("2026-10-01T00:00:00Z"), referenceId: "sub_sep" });
  await seedSparkTransaction({ userId, amount: 10, type: "UPLOAD_REWARD", source: "SNAP", sparkKind: "EARNED", referenceId: "snap_earned" });

  const balance = await getSparkBalance(userId);
  assert.equal(balance.subscription, 30);
  assert.equal(balance.earned, 10);
  assert.equal(balance.total, 40);
});

// ===========================================================================
// Earning tests
// ===========================================================================

test("earnSparks credits +1 for eligible upload", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_earn_ok");
  const snapId = await createTestSnap(userId, userId);
  const result = await earnSparks({ userId, snapId });
  assert.equal(result.credited, true);
  assert.ok(result.transactionId);
  const balance = await getSparkBalance(userId);
  assert.equal(balance.total, 1);
});

test("earnSparks is idempotent for same snapId", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_earn_idem");
  const snapId = await createTestSnap(userId, userId);
  const first = await earnSparks({ userId, snapId });
  assert.equal(first.credited, true);
  const second = await earnSparks({ userId, snapId });
  assert.equal(second.credited, false);
  assert.equal(second.transactionId, first.transactionId);
  const balance = await getSparkBalance(userId);
  assert.equal(balance.total, 1);
});

test("10 uploads earn at most 10 Sparks per day", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_earn_cap");
  for (let i = 0; i < 12; i++) {
    const snapId = await createTestSnap(userId, userId);
    const result = await earnSparks({ userId, snapId });
    assert.equal(result.credited, i < 10, `Upload ${i + 1}`);
  }
  const balance = await getSparkBalance(userId);
  assert.equal(balance.earned, 10);
});

test("earnSparks daily cap resets in new daily period", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_earn_reset");
  const endOfDay = new Date("2026-09-20T17:29:00Z");
  for (let i = 0; i < 10; i++) {
    const snapId = await createTestSnap(userId, userId);
    await earnSparks({ userId, snapId }, endOfDay);
  }
  const dailyUsage = await getDailySparkUsage(userId, endOfDay);
  assert.equal(dailyUsage.earningCapReached, true);

  const nextDay = new Date("2026-09-20T17:30:00Z");
  const dailyUsageNext = await getDailySparkUsage(userId, nextDay);
  assert.equal(dailyUsageNext.sparksEarnedToday, 0);
  assert.equal(dailyUsageNext.earningCapReached, false);
});

// ===========================================================================
// Spending tests
// ===========================================================================

test("spendSparks succeeds with sufficient balance", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_spend_ok");
  await seedSparkTransaction({ userId, amount: 10, type: "UPLOAD_REWARD", source: "SNAP", sparkKind: "EARNED", referenceId: "earned_s" });
  const result = await spendSparks({ userId, type: "EXTRA_SNAP_UPLOAD", referenceId: "upload_s1" });
  assert.equal(result.ok, true);
  assert.equal(result.idempotent, false);
  assert.equal(result.amountDeducted, EXTRA_UPLOAD_COST_SPARKS);
  const balance = await getSparkBalance(userId);
  assert.equal(balance.total, 10 - EXTRA_UPLOAD_COST_SPARKS);
});

test("spendSparks fails with insufficient balance", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_spend_insuf");
  await seedSparkTransaction({ userId, amount: 2, type: "UPLOAD_REWARD", source: "SNAP", sparkKind: "EARNED", referenceId: "earned_i" });
  await assert.rejects(
    () => spendSparks({ userId, type: "EXTRA_SNAP_UPLOAD", referenceId: "upload_f" }),
    (err: unknown) => {
      assert.ok(err instanceof SparkServiceError);
      assert.equal(err.code, "insufficient_sparks");
      return true;
    },
  );
});

test("spendSparks idempotent replay returns correct metadata", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_spend_idem");
  await seedSparkTransaction({ userId, amount: 10, type: "UPLOAD_REWARD", source: "SNAP", sparkKind: "EARNED", referenceId: "earned_id" });
  await seedSparkTransaction({ userId, amount: 5, type: "SUBSCRIPTION_GRANT", source: "SUBSCRIPTION", sparkKind: "SUBSCRIPTION", referenceId: "sub_id" });

  const first = await spendSparks({ userId, type: "EXTRA_SNAP_UPLOAD", referenceId: "upload_id" });
  assert.equal(first.idempotent, false);
  assert.equal(first.subscriptionPortion, 5);
  assert.equal(first.earnedPortion, 0);

  const second = await spendSparks({ userId, type: "EXTRA_SNAP_UPLOAD", referenceId: "upload_id" });
  assert.equal(second.idempotent, true);
  assert.equal(second.subscriptionPortion, 5, "Should return original subscription portion");
  assert.equal(second.earnedPortion, 0);
  assert.equal(second.transactionId, first.transactionId);
});

test("subscription Sparks are spent before earned", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_spend_prio");
  await seedSparkTransaction({ userId, amount: 5, type: "UPLOAD_REWARD", source: "SNAP", sparkKind: "EARNED", referenceId: "earned_p" });
  await seedSparkTransaction({ userId, amount: 10, type: "SUBSCRIPTION_GRANT", source: "SUBSCRIPTION", sparkKind: "SUBSCRIPTION", referenceId: "sub_p" });

  const result = await spendSparks({ userId, type: "EXTRA_SNAP_UPLOAD", referenceId: "upload_p" });
  assert.equal(result.subscriptionPortion, 5);
  assert.equal(result.earnedPortion, 0);
  const balance = await getSparkBalance(userId);
  assert.equal(balance.subscription, 5);
  assert.equal(balance.earned, 5);
});

test("expired subscription Sparks cannot be spent", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_spend_exp");
  await seedSparkTransaction({ userId, amount: 50, type: "SUBSCRIPTION_GRANT", source: "SUBSCRIPTION", sparkKind: "SUBSCRIPTION", expiresAt: new Date("2026-08-01T00:00:00Z"), referenceId: "sub_exp" });
  await seedSparkTransaction({ userId, amount: 2, type: "UPLOAD_REWARD", source: "SNAP", sparkKind: "EARNED", referenceId: "earned_exp" });
  await assert.rejects(
    () => spendSparks({ userId, type: "EXTRA_SNAP_UPLOAD", referenceId: "upload_exp" }),
    (err: unknown) => {
      assert.ok(err instanceof SparkServiceError);
      assert.equal(err.code, "insufficient_sparks");
      return true;
    },
  );
});

// ===========================================================================
// Daily upload counter (F4)
// ===========================================================================

test("incrementDailyUploadCounter enforces limit", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_counter");
  const now = new Date();
  for (let i = 0; i < FREE_DAILY_UPLOADS; i++) {
    const r = await incrementDailyUploadCounter(prisma, userId, now);
    assert.ok(r, `Increment ${i + 1}`);
    assert.equal(r.newCount, i + 1);
  }
  const overflow = await incrementDailyUploadCounter(prisma, userId, now);
  assert.equal(overflow, null);
});

test("incrementDailyUploadCounter resets on new day", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_counter_rst");
  const today = new Date("2026-09-20T10:00:00Z");
  for (let i = 0; i < FREE_DAILY_UPLOADS; i++) {
    await incrementDailyUploadCounter(prisma, userId, today);
  }
  const tomorrow = new Date("2026-09-20T17:30:00Z");
  const r = await incrementDailyUploadCounter(prisma, userId, tomorrow);
  assert.ok(r);
  assert.equal(r.newCount, 1);
});

test("concurrent incrementDailyUploadCounter cannot exceed limit", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_counter_conc");
  const now = new Date();
  for (let i = 0; i < FREE_DAILY_UPLOADS - 1; i++) {
    await incrementDailyUploadCounter(prisma, userId, now);
  }
  const results = await Promise.allSettled([
    incrementDailyUploadCounter(prisma, userId, now),
    incrementDailyUploadCounter(prisma, userId, now),
    incrementDailyUploadCounter(prisma, userId, now),
  ]);
  const succeeded = results.filter((r) => r.status === "fulfilled" && r.value !== null);
  assert.ok(succeeded.length <= 1, `Expected ≤1 success, got ${succeeded.length}`);
});

// ===========================================================================
// Daily Spark earn counter (F5)
// ===========================================================================

test("incrementDailySparkEarnCounter enforces cap", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_earn_ctr");
  const now = new Date();
  for (let i = 0; i < DAILY_SPARK_EARNING_CAP; i++) {
    const r = await incrementDailySparkEarnCounter(prisma, userId, now);
    assert.ok(r, `Increment ${i + 1}`);
    assert.equal(r.newCount, i + 1);
  }
  const overflow = await incrementDailySparkEarnCounter(prisma, userId, now);
  assert.equal(overflow, null);
});

test("concurrent earnSparks at cap boundary cannot exceed 10", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_earn_conc");
  for (let i = 0; i < 9; i++) {
    const snapId = await createTestSnap(userId, userId);
    await earnSparks({ userId, snapId });
  }
  const snapA = await createTestSnap(userId, userId);
  const snapB = await createTestSnap(userId, userId);
  const snapC = await createTestSnap(userId, userId);
  const results = await Promise.allSettled([
    earnSparks({ userId, snapId: snapA }),
    earnSparks({ userId, snapId: snapB }),
    earnSparks({ userId, snapId: snapC }),
  ]);
  const credited = results.filter((r) => r.status === "fulfilled" && r.value.credited);
  assert.ok(credited.length <= 1, `Expected ≤1 credit, got ${credited.length}`);
  const balance = await getSparkBalance(userId);
  assert.ok(balance.total <= 10, `Balance ${balance.total} > 10`);
});

// ===========================================================================
// Upload usage
// ===========================================================================

test("getDailyUploadUsage tracks via counter and paid uploads", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_usage");
  const snap3 = await createTestSnap(userId, userId);
  const now = new Date();
  await incrementDailyUploadCounter(prisma, userId, now);
  await incrementDailyUploadCounter(prisma, userId, now);
  await recordUploadUsage(prisma, userId, snap3, false);

  const usage = await getDailyUploadUsage(userId);
  assert.equal(usage.freeUploadsUsed, 2);
  assert.equal(usage.sparkUploadsUsed, 1);
  assert.equal(usage.totalUploads, 3);
  assert.equal(usage.freeUploadsRemaining, FREE_DAILY_UPLOADS - 2);
});

test("getDailyUploadUsage resets in new daily period", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_usage_rst");
  const endOfDay = new Date("2026-09-20T17:29:00Z");
  for (let i = 0; i < FREE_DAILY_UPLOADS; i++) {
    await incrementDailyUploadCounter(prisma, userId, endOfDay);
  }
  const usageEnd = await getDailyUploadUsage(userId, endOfDay);
  assert.equal(usageEnd.freeUploadsUsed, FREE_DAILY_UPLOADS);
  assert.equal(usageEnd.dailyLimitReached, true);

  const nextDay = new Date("2026-09-20T17:30:00Z");
  const usageNext = await getDailyUploadUsage(userId, nextDay);
  assert.equal(usageNext.freeUploadsUsed, 0);
  assert.equal(usageNext.dailyLimitReached, false);
});

// ===========================================================================
// F1: Non-nullable referenceId
// ===========================================================================

test("referenceId non-nullable: duplicate (user, type, referenceId) is rejected", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_ref_nn");
  await seedSparkTransaction({ userId, amount: 5, type: "UPLOAD_REWARD", source: "SNAP", sparkKind: "EARNED", referenceId: "snap_nn_1" });
  await assert.rejects(
    () => seedSparkTransaction({ userId, amount: 3, type: "UPLOAD_REWARD", source: "SNAP", sparkKind: "EARNED", referenceId: "snap_nn_1" }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /unique/i);
      return true;
    },
  );
});

// ===========================================================================
// F3: Idempotency — concurrent earn
// ===========================================================================

test("concurrent earnSparks for same snapId: only one credits", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_conc_earn");
  const snapId = await createTestSnap(userId, userId);
  const [first, second] = await Promise.all([
    earnSparks({ userId, snapId }),
    earnSparks({ userId, snapId }),
  ]);
  const credited = [first, second].filter((r) => r.credited);
  assert.equal(credited.length, 1);
  const balance = await getSparkBalance(userId);
  assert.equal(balance.total, 1);
});

// ===========================================================================
// F3: Idempotency — different keys = different operations
// ===========================================================================

test("different idempotencyKeys represent different operations", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_diff_keys");
  await seedSparkTransaction({ userId, amount: 20, type: "UPLOAD_REWARD", source: "SNAP", sparkKind: "EARNED", referenceId: "earned_dk" });

  const r1 = await spendSparks({ userId, type: "CAPTION_EDIT", referenceId: "key_alpha" });
  const r2 = await spendSparks({ userId, type: "CAPTION_EDIT", referenceId: "key_beta" });
  assert.equal(r1.idempotent, false);
  assert.equal(r2.idempotent, false);
  assert.notEqual(r1.transactionId, r2.transactionId);
  const balance = await getSparkBalance(userId);
  assert.equal(balance.total, 20 - CAPTION_EDIT_COST_SPARKS * 2);
});

// ===========================================================================
// Shared upload service
// ===========================================================================

test("createSnapWithSparkAccounting: free upload creates snap + counter + reward", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_shared_free");
  const snap = await createSnapWithSparkAccounting({
    targetUserId: userId,
    uploadedById: userId,
    imageUrl: "https://res.cloudinary.com/test/image/upload/shared1.jpg",
    publicId: "test/shared1",
    idempotencyKey: `shared-free-${Date.now()}`,
  });
  assert.equal(snap.ok, true);
  assert.equal(snap.isFreeUpload, true);
  assert.equal(snap.sparkRewardCredited, true);
  testSnapIds.push(snap.snap.id);

  const balance = await getSparkBalance(userId);
  assert.equal(balance.total, 1);
  const usage = await getDailyUploadUsage(userId);
  assert.equal(usage.freeUploadsUsed, 1);
});

test("createSnapWithSparkAccounting: paid upload spends sparks, no reward", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_shared_paid");
  // Fill free slots.
  for (let i = 0; i < FREE_DAILY_UPLOADS; i++) {
    await incrementDailyUploadCounter(prisma, userId, new Date());
  }
  // Give some sparks.
  await seedSparkTransaction({ userId, amount: 10, type: "UPLOAD_REWARD", source: "SNAP", sparkKind: "EARNED", referenceId: "earned_sp" });

  const snap = await createSnapWithSparkAccounting({
    targetUserId: userId,
    uploadedById: userId,
    imageUrl: "https://res.cloudinary.com/test/image/upload/shared2.jpg",
    publicId: "test/shared2",
    idempotencyKey: `shared-paid-${Date.now()}`,
  });
  assert.equal(snap.ok, true);
  assert.equal(snap.isFreeUpload, false);
  assert.equal(snap.sparkRewardCredited, false);
  testSnapIds.push(snap.snap.id);

  const balance = await getSparkBalance(userId);
  assert.equal(balance.total, 10 - EXTRA_UPLOAD_COST_SPARKS);
});

test("same paid upload idempotency key returns the same Snap and charges once", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_shared_idem_paid");
  await seedSparkTransaction({ userId, amount: 10, type: "UPLOAD_REWARD", source: "SNAP", sparkKind: "EARNED", referenceId: "earned_si" });
  for (let i = 0; i < FREE_DAILY_UPLOADS; i++) {
    await incrementDailyUploadCounter(prisma, userId, new Date());
  }
  const key = `idem-paid-${Date.now()}`;
  const input = {
    targetUserId: userId,
    uploadedById: userId,
    imageUrl: "https://res.cloudinary.com/test/image/upload/idem1.jpg",
    publicId: "test/idem1",
    idempotencyKey: key,
  };

  const first = await createSnapWithSparkAccounting(input);
  const second = await createSnapWithSparkAccounting(input);
  testSnapIds.push(first.snap.id);

  assert.equal(first.idempotent, false);
  assert.equal(second.idempotent, true);
  assert.equal(second.snap.id, first.snap.id);
  assert.equal((await prisma.snap.count({ where: { uploadedById: userId } })), 1);
  assert.equal((await prisma.uploadUsage.count({ where: { userId } })), 1);
  assert.equal((await prisma.sparkTransaction.count({ where: { userId, type: "EXTRA_SNAP_UPLOAD", referenceId: key } })), 1);
  assert.equal((await getSparkBalance(userId)).total, 10 - EXTRA_UPLOAD_COST_SPARKS);
});

test("same free upload idempotency key returns the same Snap and rewards once", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_shared_idem_free");
  const key = `idem-free-${Date.now()}`;
  const input = {
    targetUserId: userId,
    uploadedById: userId,
    imageUrl: "https://res.cloudinary.com/test/image/upload/idem-free.jpg",
    publicId: "test/idem-free",
    idempotencyKey: key,
  };

  const first = await createSnapWithSparkAccounting(input);
  const second = await createSnapWithSparkAccounting(input);
  testSnapIds.push(first.snap.id);

  assert.equal(first.idempotent, false);
  assert.equal(second.idempotent, true);
  assert.equal(second.snap.id, first.snap.id);
  assert.equal((await prisma.snap.count({ where: { uploadedById: userId } })), 1);
  assert.equal((await prisma.uploadUsage.count({ where: { userId } })), 1);
  assert.equal((await prisma.sparkTransaction.count({ where: { userId, type: "UPLOAD_REWARD", referenceId: first.snap.id } })), 1);
  assert.equal((await getSparkBalance(userId)).total, 1);
});

test("three concurrent identical upload requests create one Snap and one charge", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_shared_idem_conc");
  for (let i = 0; i < FREE_DAILY_UPLOADS; i++) {
    await incrementDailyUploadCounter(prisma, userId, new Date());
  }
  await seedSparkTransaction({ userId, amount: 10, type: "UPLOAD_REWARD", source: "SNAP", sparkKind: "EARNED", referenceId: "earned_sic" });
  const key = `idem-concurrent-${Date.now()}`;
  const input = {
    targetUserId: userId,
    uploadedById: userId,
    imageUrl: "https://res.cloudinary.com/test/image/upload/idem-concurrent.jpg",
    publicId: "test/idem-concurrent",
    idempotencyKey: key,
  };

  const results = await Promise.all([
    createSnapWithSparkAccounting(input),
    createSnapWithSparkAccounting(input),
    createSnapWithSparkAccounting(input),
  ]);
  testSnapIds.push(results[0].snap.id);

  assert.equal(new Set(results.map((r) => r.snap.id)).size, 1);
  assert.equal((await prisma.snap.count({ where: { uploadedById: userId } })), 1);
  assert.equal((await prisma.sparkTransaction.count({ where: { userId, type: "EXTRA_SNAP_UPLOAD", referenceId: key } })), 1);
  assert.equal((await getSparkBalance(userId)).total, 10 - EXTRA_UPLOAD_COST_SPARKS);
});

test("different upload idempotency keys create different operations", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_shared_diff_keys");
  const base = { targetUserId: userId, uploadedById: userId };
  const first = await createSnapWithSparkAccounting({ ...base, imageUrl: "https://res.cloudinary.com/test/image/upload/diff-a.jpg", publicId: "test/diff-a", idempotencyKey: `diff-a-${Date.now()}` });
  const second = await createSnapWithSparkAccounting({ ...base, imageUrl: "https://res.cloudinary.com/test/image/upload/diff-b.jpg", publicId: "test/diff-b", idempotencyKey: `diff-b-${Date.now()}` });
  testSnapIds.push(first.snap.id, second.snap.id);
  assert.notEqual(first.snap.id, second.snap.id);
  assert.equal((await prisma.snap.count({ where: { uploadedById: userId } })), 2);
});

test("createSnapWithSparkAccounting: insufficient sparks returns error", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_shared_insuf");
  // Fill free slots.
  for (let i = 0; i < FREE_DAILY_UPLOADS; i++) {
    await incrementDailyUploadCounter(prisma, userId, new Date());
  }
  // No sparks at all.

  await assert.rejects(
    () => createSnapWithSparkAccounting({
      targetUserId: userId,
      uploadedById: userId,
      imageUrl: "https://res.cloudinary.com/test/image/upload/insuf1.jpg",
      publicId: "test/insuf1",
      idempotencyKey: `insuf-${Date.now()}`,
    }),
    (err: unknown) => {
      assert.ok(err instanceof SparkServiceError);
      assert.equal(err.code, "insufficient_sparks");
      return true;
    },
  );
});

test("createSnapWithSparkAccounting: failed snap creation rolls back spark spending", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_shared_rollback");
  // Fill free slots.
  for (let i = 0; i < FREE_DAILY_UPLOADS; i++) {
    await incrementDailyUploadCounter(prisma, userId, new Date());
  }
  await seedSparkTransaction({ userId, amount: 10, type: "UPLOAD_REWARD", source: "SNAP", sparkKind: "EARNED", referenceId: "earned_rb" });

  // Use a non-existent target user to trigger a rollback.
  await assert.rejects(
    () => createSnapWithSparkAccounting({
      targetUserId: "nonexistent_user_id",
      uploadedById: userId,
      imageUrl: "https://res.cloudinary.com/test/image/upload/rollback1.jpg",
      publicId: "test/rollback1",
      idempotencyKey: `rollback-${Date.now()}`,
    }),
    (err: unknown) => {
      assert.ok(err instanceof SparkServiceError);
      assert.equal(err.code, "invalid_operation");
      return true;
    },
  );

  // Sparks should NOT have been deducted (transaction rolled back).
  const balance = await getSparkBalance(userId);
  assert.equal(balance.total, 10, "Sparks should not be deducted after rollback");
});

// ===========================================================================
// Transaction history
// ===========================================================================

test("getSparkTransactions returns history newest first", { skip: !hasDb ? "DATABASE_URL not set" : false }, async () => {
  const userId = await createTestUser("spark_t_history");
  await seedSparkTransaction({ userId, amount: 5, type: "UPLOAD_REWARD", source: "SNAP", sparkKind: "EARNED", referenceId: "h_a" });
  await seedSparkTransaction({ userId, amount: -2, type: "CAPTION_EDIT", source: "SNAP", sparkKind: "EARNED", referenceId: "h_b" });
  await seedSparkTransaction({ userId, amount: 10, type: "SUBSCRIPTION_GRANT", source: "SUBSCRIPTION", sparkKind: "SUBSCRIPTION", referenceId: "h_c" });

  const { transactions, nextCursor } = await getSparkTransactions({ userId, limit: 10 });
  assert.equal(transactions.length, 3);
  assert.equal(nextCursor, null);
  assert.equal(transactions[0].type, "SUBSCRIPTION_GRANT");
});

// ===========================================================================
// Constants sanity
// ===========================================================================

test("Spark constants are correct per v1 spec", () => {
  assert.equal(FREE_DAILY_UPLOADS, 10);
  assert.equal(DAILY_SPARK_EARNING_CAP, 10);
  assert.equal(SPARK_PER_UPLOAD_REWARD, 1);
  assert.equal(EXTRA_UPLOAD_COST_SPARKS, 5);
  assert.equal(CAPTION_EDIT_COST_SPARKS, 2);
});
