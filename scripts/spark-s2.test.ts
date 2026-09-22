/**
 * S2 — Snap Integration tests (Spark Economy).
 *
 * Covers the server-authoritative usage summary, the free / paid / insufficient
 * upload states, post-upload refresh state, idempotency, and the wiring of the
 * Spark UI into the shared upload flow (Web/PWA + Telegram Mini App + Bot).
 *
 * Source-level tests always run. Database-backed tests import the Spark
 * service lazily (lib/prisma.ts throws without DATABASE_URL) and skip
 * gracefully when no database is configured.
 *
 * Run: npm run test:spark-s2
 */
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PrismaClient } from "@prisma/client";

const hasDb = !!process.env.DATABASE_URL;

/** Locked S1 business rules — asserted against the service source of truth. */
const FREE_DAILY_UPLOADS = 10;
const DAILY_SPARK_EARNING_CAP = 10;
const SPARK_PER_UPLOAD_REWARD = 1;
const EXTRA_UPLOAD_COST_SPARKS = 5;

const testUserIds: string[] = [];
let uploadSequence = 0;
let prisma: PrismaClient | null = null;

function read(relativePath: string): string {
  return readFileSync(resolve(import.meta.dirname, "..", relativePath), "utf8");
}

/** Lazy Prisma client — lib/prisma.ts throws at import time without DATABASE_URL. */
async function db(): Promise<PrismaClient> {
  if (!prisma) {
    const { PrismaClient: PrismaClientCtor } = await import("@prisma/client");
    prisma = new PrismaClientCtor();
  }
  return prisma;
}

async function createTestUser(name: string): Promise<string> {
  const client = await db();
  const user = await client.user.create({
    data: { name, profileImage: "https://example.com/test.jpg" },
  });
  testUserIds.push(user.id);
  return user.id;
}

async function seedEarnedSparks(userId: string, amount: number) {
  const client = await db();
  // ADMIN_ADJUSTMENT credits balance without registering an upload reward,
  // so it does not pollute the daily-earned metric under test.
  return client.sparkTransaction.create({
    data: {
      userId,
      amount,
      type: "ADMIN_ADJUSTMENT",
      source: "ADMIN",
      sparkKind: "EARNED",
      referenceType: "test",
      referenceId: `s2_seed_${userId}_${amount}_${Date.now()}`,
    },
  });
}

/** Consume the full daily free allowance for a user (10 uploads). */
async function exhaustFreeUploads(userId: string): Promise<void> {
  const client = await db();
  const { incrementDailyUploadCounter } = await import(
    "../lib/spark-service"
  );
  for (let i = 0; i < FREE_DAILY_UPLOADS; i += 1) {
    await client.$transaction((tx) =>
      incrementDailyUploadCounter(tx, userId, new Date()),
    );
  }
}

function nextUpload(userId: string) {
  uploadSequence += 1;
  return {
    targetUserId: userId,
    uploadedById: userId,
    imageUrl: "https://res.cloudinary.com/test/image/upload/s2_test.jpg",
    publicId: `test/s2_test_${uploadSequence}`,
    idempotencyKey: `s2-${userId}-${uploadSequence}`,
  };
}

after(async () => {
  if (!prisma) return;
  for (const userId of testUserIds) {
    await prisma.sparkTransaction.deleteMany({ where: { userId } });
    await prisma.uploadUsage.deleteMany({ where: { userId } });
    await prisma.snapUploadOperation.deleteMany({ where: { userId } });
    await prisma.dailyUploadCounter.deleteMany({ where: { userId } });
    await prisma.dailySparkEarnCounter.deleteMany({ where: { userId } });
    await prisma.snap.deleteMany({
      where: { OR: [{ userId }, { uploadedById: userId }] },
    });
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

// ===========================================================================
// Source-level wiring (always runs)
// ===========================================================================

test("service declares the locked S1 economy constants", () => {
  const service = read("lib/spark-service.ts");
  assert.match(service, /FREE_DAILY_UPLOADS = 10/);
  assert.match(service, /DAILY_SPARK_EARNING_CAP = 10/);
  assert.match(service, /SPARK_PER_UPLOAD_REWARD = 1/);
  assert.match(service, /EXTRA_UPLOAD_COST_SPARKS = 5/);
});

test("server exposes a dedicated Spark usage summary endpoint", () => {
  const route = read("app/api/sparks/usage/route.ts");
  assert.match(route, /export async function GET/);
  assert.match(route, /requireSession/);
  assert.match(route, /getSparkUsageSummary/);
  assert.match(route, /401/);
});

test("usage summary is derived in the Spark service, not in routes", () => {
  const service = read("lib/spark-service.ts");
  assert.match(service, /export async function getSparkUsageSummary/);
  assert.match(
    service,
    /getSparkBalance\(userId\)[\s\S]*getDailyUploadUsage\(userId, now\)[\s\S]*getDailySparkUsage\(userId, now\)/,
  );
  assert.match(service, /freeUploadsRemaining/);
  assert.match(service, /dailyEarnRemaining/);
  assert.match(service, /extraUploadCost/);
  assert.match(service, /nextUploadIsPaid/);
  assert.match(service, /canAffordNextUpload/);

  // The summary must not leak ledger internals to the UI.
  const types = read("lib/spark-usage.ts");
  assert.doesNotMatch(types, /transactionId|referenceId|sparkKind/);
});

test("upload responses carry the server Spark result and refreshed usage", () => {
  const web = read("app/api/snaps/route.ts");
  assert.match(web, /sparkSpent/);
  assert.match(web, /sparkRewarded/);
  assert.match(web, /usage/);
  assert.match(web, /code: 'insufficient_sparks'/);

  const miniApp = read("app/api/telegram/mini-app/snaps/route.ts");
  assert.match(miniApp, /sparkSpent/);
  assert.match(miniApp, /sparkRewarded/);
  assert.match(miniApp, /usage/);
  assert.match(miniApp, /code: "insufficient_sparks"/);
});

test("upload client surfaces insufficient Sparks and returns Spark outcome", () => {
  const client = read("lib/snap-upload-client.ts");
  assert.match(client, /"insufficient_sparks"/);
  assert.match(client, /data\?\.code === "insufficient_sparks"/);
  assert.match(client, /spark: data\.spark/);
  assert.match(client, /usage: data\.usage/);
  assert.match(client, /SnapUploadSparkOutcome/);
});

test("shared upload composer shows Spark state, confirmation, and blocked state", () => {
  const composer = read("components/snaps/SnapCreateComposerModal.tsx");
  assert.match(composer, /SparkUsageIndicator/);
  assert.match(composer, /useSparkUsage/);
  assert.match(composer, /confirmingPaidUpload/);
  assert.match(
    composer,
    /Use \{usage\.extraUploadCost\} Sparks to upload this Snap\?/,
  );
  assert.match(composer, /Upload for \{usage\.extraUploadCost\} Sparks/);
  assert.match(composer, /outOfSparks/);
  assert.match(composer, /out of Sparks/);
  assert.match(composer, /Snap uploaded/);
  assert.match(composer, /sparkRewarded/);
  assert.match(composer, /sparkSpent/);
  assert.match(composer, /applyUsage\(result\.usage\)/);

  // The client renders server values only — no local cost/balance math.
  assert.doesNotMatch(composer, /EXTRA_UPLOAD_COST_SPARKS/);
  assert.doesNotMatch(composer, /FREE_DAILY_UPLOADS\s*=/);
});

test("usage indicator renders balance and free uploads from server data", () => {
  const indicator = read("components/snaps/SparkUsageIndicator.tsx");
  assert.match(indicator, /✨/);
  assert.match(
    indicator,
    /Free uploads today: \{usage\.freeUploadsUsed\} \/ \{usage\.freeDailyUploads\}/,
  );
  assert.doesNotMatch(indicator, /fetch\(/);
});

test("Telegram Mini App reuses the shared upload flow with Spark UI", () => {
  const miniAppUpload = read("components/telegram/TelegramMiniAppUpload.tsx");
  assert.match(miniAppUpload, /BottomNavCameraFlow/);

  const sharedFlow = read("components/mobile/BottomNavCameraFlow.tsx");
  assert.match(sharedFlow, /SnapCreateComposerModal/);
  assert.match(sharedFlow, /uploadSnapForUser/);
  assert.match(sharedFlow, /return result/);
});

test("Telegram Bot reports the actual server Spark outcome", () => {
  const messages = read("lib/telegram/messages.ts");
  assert.match(messages, /formatUploadSuccessResult/);
  assert.match(messages, /formatUploadInsufficientSparksMessage/);
  assert.match(messages, /-\$\{outcome\.sparkSpent\} Sparks/);
  assert.match(messages, /\+\$\{outcome\.sparkRewarded\} Spark/);

  const bot = read("lib/telegram/upload-snap.ts");
  assert.match(bot, /formatUploadSuccessResult/);
  assert.match(bot, /formatUploadInsufficientSparksMessage/);
  assert.match(bot, /getSparkUsageSummary/);
  assert.doesNotMatch(bot, /"Not enough Sparks for this upload\."/);
});

// ===========================================================================
// Database-backed behavior tests
// ===========================================================================

test(
  "free upload succeeds, earns a Spark, and increments free usage",
  { skip: !hasDb ? "DATABASE_URL not set" : false },
  async () => {
    const sparkService = await import("../lib/spark-service");
    const { createSnapWithSparkAccounting } = await import(
      "../lib/snap-upload-service"
    );

    const userId = await createTestUser("s2_free_upload");

    const before = await sparkService.getSparkUsageSummary(userId);
    assert.equal(before.balance, 0);
    assert.equal(before.freeUploadsUsed, 0);
    assert.equal(before.freeUploadsRemaining, FREE_DAILY_UPLOADS);
    assert.equal(before.nextUploadIsPaid, false);
    assert.equal(before.canAffordNextUpload, true);
    assert.equal(before.freeDailyUploads, FREE_DAILY_UPLOADS);
    assert.equal(before.extraUploadCost, EXTRA_UPLOAD_COST_SPARKS);
    assert.equal(before.uploadReward, SPARK_PER_UPLOAD_REWARD);

    const result = await createSnapWithSparkAccounting(nextUpload(userId));
    assert.equal(result.isFreeUpload, true);
    assert.equal(result.sparkRewardCredited, true);
    assert.equal(result.sparkSpent, 0);

    const afterUpload = await sparkService.getSparkUsageSummary(userId);
    assert.equal(afterUpload.freeUploadsUsed, 1);
    assert.equal(afterUpload.freeUploadsRemaining, FREE_DAILY_UPLOADS - 1);
    assert.equal(afterUpload.dailyEarnedSparks, SPARK_PER_UPLOAD_REWARD);
    assert.equal(
      afterUpload.dailyEarnRemaining,
      DAILY_SPARK_EARNING_CAP - SPARK_PER_UPLOAD_REWARD,
    );
    assert.equal(afterUpload.balance, SPARK_PER_UPLOAD_REWARD);
  },
);

test(
  "paid upload spends configured Sparks and earns no reward",
  { skip: !hasDb ? "DATABASE_URL not set" : false },
  async () => {
    const sparkService = await import("../lib/spark-service");
    const { createSnapWithSparkAccounting } = await import(
      "../lib/snap-upload-service"
    );

    const userId = await createTestUser("s2_paid_upload");
    await exhaustFreeUploads(userId);
    await seedEarnedSparks(userId, 7);

    const before = await sparkService.getSparkUsageSummary(userId);
    assert.equal(before.freeUploadsRemaining, 0);
    assert.equal(before.nextUploadIsPaid, true);
    assert.equal(before.canAffordNextUpload, true);
    assert.equal(before.extraUploadCost, EXTRA_UPLOAD_COST_SPARKS);

    const result = await createSnapWithSparkAccounting(nextUpload(userId));
    assert.equal(result.isFreeUpload, false);
    assert.equal(result.sparkRewardCredited, false);
    assert.equal(result.sparkSpent, EXTRA_UPLOAD_COST_SPARKS);

    const afterUpload = await sparkService.getSparkUsageSummary(userId);
    assert.equal(afterUpload.balance, 7 - EXTRA_UPLOAD_COST_SPARKS);
    assert.equal(afterUpload.freeUploadsUsed, FREE_DAILY_UPLOADS);
    assert.equal(afterUpload.dailyEarnedSparks, 0);
    assert.equal(afterUpload.nextUploadIsPaid, true);
  },
);

test(
  "insufficient Sparks rejects the upload without Snap or negative balance",
  { skip: !hasDb ? "DATABASE_URL not set" : false },
  async () => {
    const { SparkServiceError, getSparkUsageSummary, getSparkBalance } =
      await import("../lib/spark-service");
    const { createSnapWithSparkAccounting } = await import(
      "../lib/snap-upload-service"
    );
    const client = await db();

    const userId = await createTestUser("s2_insufficient");
    await exhaustFreeUploads(userId);

    const before = await getSparkUsageSummary(userId);
    assert.equal(before.nextUploadIsPaid, true);
    assert.equal(before.canAffordNextUpload, false);

    const upload = nextUpload(userId);
    await assert.rejects(
      () => createSnapWithSparkAccounting(upload),
      (err: unknown) => {
        assert.ok(err instanceof SparkServiceError);
        assert.equal(err.code, "insufficient_sparks");
        return true;
      },
    );

    const balance = await getSparkBalance(userId);
    assert.equal(balance.total, 0, "balance must never go negative");

    assert.equal(
      await client.snap.count({ where: { uploadedById: userId } }),
      0,
      "no Snap may be created",
    );
    assert.equal(
      await client.uploadUsage.count({ where: { userId } }),
      0,
      "no upload usage recorded",
    );
    assert.equal(
      await client.snapUploadOperation.count({ where: { userId } }),
      0,
      "failed upload leaves no operation behind",
    );
  },
);

test(
  "usage summary matches the database state after uploads (refresh)",
  { skip: !hasDb ? "DATABASE_URL not set" : false },
  async () => {
    const sparkService = await import("../lib/spark-service");
    const { createSnapWithSparkAccounting } = await import(
      "../lib/snap-upload-service"
    );

    const userId = await createTestUser("s2_refresh");
    await seedEarnedSparks(userId, 3);

    await createSnapWithSparkAccounting(nextUpload(userId));
    await createSnapWithSparkAccounting(nextUpload(userId));

    const summary = await sparkService.getSparkUsageSummary(userId);
    const [balance, uploadUsage, sparkUsage] = await Promise.all([
      sparkService.getSparkBalance(userId),
      sparkService.getDailyUploadUsage(userId),
      sparkService.getDailySparkUsage(userId),
    ]);

    assert.equal(summary.balance, balance.total);
    assert.equal(summary.freeUploadsUsed, uploadUsage.freeUploadsUsed);
    assert.equal(
      summary.freeUploadsRemaining,
      uploadUsage.freeUploadsRemaining,
    );
    assert.equal(summary.dailyEarnedSparks, sparkUsage.sparksEarnedToday);
    assert.equal(summary.dailyEarnRemaining, sparkUsage.earningCapRemaining);
    assert.equal(summary.balance, 3 + 2 * SPARK_PER_UPLOAD_REWARD);
  },
);

test(
  "idempotent paid upload creates one Snap and one charge",
  { skip: !hasDb ? "DATABASE_URL not set" : false },
  async () => {
    const { getSparkBalance, getSparkUsageSummary } = await import(
      "../lib/spark-service"
    );
    const { createSnapWithSparkAccounting } = await import(
      "../lib/snap-upload-service"
    );
    const client = await db();

    const userId = await createTestUser("s2_idempotent");
    await exhaustFreeUploads(userId);
    await seedEarnedSparks(userId, 7);

    const upload = nextUpload(userId);
    const first = await createSnapWithSparkAccounting(upload);
    const second = await createSnapWithSparkAccounting(upload);

    assert.equal(first.idempotent, false);
    assert.equal(second.idempotent, true);
    assert.equal(second.snap.id, first.snap.id);
    assert.equal(second.isFreeUpload, first.isFreeUpload);
    assert.equal(second.sparkRewardCredited, first.sparkRewardCredited);
    assert.equal(second.sparkSpent, first.sparkSpent);

    const balance = await getSparkBalance(userId);
    assert.equal(
      balance.total,
      7 - EXTRA_UPLOAD_COST_SPARKS,
      "replay must not charge twice",
    );

    assert.equal(
      await client.sparkTransaction.count({
        where: {
          userId,
          type: "EXTRA_SNAP_UPLOAD",
          referenceId: upload.idempotencyKey,
        },
      }),
      1,
      "exactly one charge per logical upload",
    );
    assert.equal(
      await client.snap.count({ where: { uploadedById: userId } }),
      1,
      "exactly one Snap per logical upload",
    );
    assert.equal(
      await client.sparkTransaction.count({
        where: { userId, type: "UPLOAD_REWARD", referenceId: first.snap.id },
      }),
      0,
      "paid upload never earns a reward",
    );

    const usage = await getSparkUsageSummary(userId);
    assert.equal(usage.balance, balance.total, "summary reflects the ledger");
  },
);

test(
  "idempotent free upload keeps a single reward",
  { skip: !hasDb ? "DATABASE_URL not set" : false },
  async () => {
    const { getSparkBalance, getSparkUsageSummary } = await import(
      "../lib/spark-service"
    );
    const { createSnapWithSparkAccounting } = await import(
      "../lib/snap-upload-service"
    );
    const client = await db();

    const userId = await createTestUser("s2_idempotent_free");

    const upload = nextUpload(userId);
    const first = await createSnapWithSparkAccounting(upload);
    const second = await createSnapWithSparkAccounting(upload);

    assert.equal(second.idempotent, true);
    assert.equal(second.snap.id, first.snap.id);

    const balance = await getSparkBalance(userId);
    assert.equal(balance.total, SPARK_PER_UPLOAD_REWARD);

    assert.equal(
      await client.sparkTransaction.count({
        where: { userId, type: "UPLOAD_REWARD", referenceId: first.snap.id },
      }),
      1,
      "one reward per snap",
    );

    const usage = await getSparkUsageSummary(userId);
    assert.equal(usage.freeUploadsUsed, 1, "one free slot consumed");
  },
);
