/**
 * S4 — Subscription Foundation tests.
 *
 * Source-level tests always run. Database-backed tests use only users
 * created by this file (prefix `s4sub_`) and skip when DATABASE_URL is
 * unavailable.
 *
 * Coverage: plan configuration, free-plan defaults, subscription grants,
 * grant idempotency (including concurrency), expiration + earned permanence,
 * spending priority, atomic/concurrent spending, plan-aware upload and
 * caption rules, period storage, transitions, and scope protection
 * (no payment functionality in S4).
 *
 * Run: npm run test:spark-s4
 */
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import {
  PLAN_CONFIG,
  DEFAULT_PLAN,
  addBillingMonths,
  getPlanConfig,
  isPaidPlan,
} from "../lib/subscription-plans";

const hasDb = Boolean(process.env.DATABASE_URL);
const SKIP = !hasDb ? "DATABASE_URL not set" : false;

const testUserIds: string[] = [];
let prisma: PrismaClient | null = null;
let sequence = 0;

function read(relativePath: string): string {
  return readFileSync(resolve(import.meta.dirname, "..", relativePath), "utf8");
}

function listFilesRecursively(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFilesRecursively(full));
    else files.push(full);
  }
  return files;
}

async function db(): Promise<PrismaClient> {
  if (!prisma) {
    const { PrismaClient: PrismaClientCtor } = await import("@prisma/client");
    prisma = new PrismaClientCtor();
  }
  return prisma;
}

/** Lazy imports of the services under test (they require DATABASE_URL). */
async function services() {
  const [spark, sub, upload, caption] = await Promise.all([
    import("../lib/spark-service"),
    import("../lib/subscription-service"),
    import("../lib/snap-upload-service"),
    import("../lib/snap-caption-service"),
  ]);
  return { spark, sub, upload, caption };
}

async function createUser(name: string): Promise<string> {
  const client = await db();
  const user = await client.user.create({
    data: { name, profileImage: "https://example.com/s4-test.jpg" },
  });
  testUserIds.push(user.id);
  return user.id;
}

async function createSnap(userId: string, caption: string | null) {
  const client = await db();
  return client.snap.create({
    data: {
      userId,
      uploadedById: userId,
      imageUrl: "https://res.cloudinary.com/test/image/upload/s4.jpg",
      publicId: `test/s4-${Date.now()}-${++sequence}`,
      caption,
    },
  });
}

async function seedSparks(
  userId: string,
  opts: {
    amount: number;
    kind: "EARNED" | "SUBSCRIPTION";
    expiresAt?: Date | null;
    type?:
      | "UPLOAD_REWARD"
      | "SUBSCRIPTION_GRANT"
      | "EXTRA_SNAP_UPLOAD"
      | "CAPTION_EDIT"
      | "ADMIN_ADJUSTMENT";
    referenceId?: string;
  },
) {
  const client = await db();
  return client.sparkTransaction.create({
    data: {
      userId,
      amount: opts.amount,
      type: opts.type ?? (opts.kind === "EARNED" ? "ADMIN_ADJUSTMENT" : "SUBSCRIPTION_GRANT"),
      source: opts.kind === "EARNED" ? "ADMIN" : "SUBSCRIPTION",
      sparkKind: opts.kind,
      expiresAt: opts.expiresAt ?? null,
      referenceType: "s4-test",
      referenceId:
        opts.referenceId ??
        `s4-seed-${userId}-${Date.now()}-${++sequence}`,
    },
  });
}

before(async () => {
  if (!hasDb) return;
  const client = await db();
  // Clean leftovers from previous (possibly failed) runs of THIS file only.
  await client.user.deleteMany({ where: { name: { startsWith: "s4sub_" } } });
});

after(async () => {
  if (!prisma) return;
  for (const userId of testUserIds) {
    await prisma.subscription.delete({ where: { userId } }).catch(() => {});
    await prisma.sparkTransaction.deleteMany({ where: { userId } });
    await prisma.uploadUsage.deleteMany({ where: { userId } });
    await prisma.dailyUploadCounter.deleteMany({ where: { userId } });
    await prisma.dailySparkEarnCounter.deleteMany({ where: { userId } });
    await prisma.snapUploadOperation.deleteMany({ where: { userId } });
    await prisma.snap.deleteMany({
      where: { OR: [{ userId }, { uploadedById: userId }] },
    });
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

// ===========================================================================
// Source-level checks (always run)
// ===========================================================================

test("plan configuration matches the agreed S4 plan table exactly", () => {
  assert.deepEqual(PLAN_CONFIG.FREE, {
    monthlyPriceMmk: 0,
    subscriptionSparks: 0,
    freeUploadsPerDay: 10,
    extraUploadCost: 5,
    captionEditCost: 2,
  });
  assert.deepEqual(PLAN_CONFIG.SPARK_PLUS, {
    monthlyPriceMmk: 29000,
    subscriptionSparks: 100,
    freeUploadsPerDay: 10,
    extraUploadCost: 4,
    captionEditCost: 1,
  });
  assert.deepEqual(PLAN_CONFIG.SPARK_PRO, {
    monthlyPriceMmk: 59000,
    subscriptionSparks: 300,
    freeUploadsPerDay: 10,
    extraUploadCost: 3,
    captionEditCost: 1,
  });
  assert.deepEqual(PLAN_CONFIG.SPARK_ULTRA, {
    monthlyPriceMmk: 99000,
    subscriptionSparks: 1000,
    freeUploadsPerDay: 15,
    extraUploadCost: 2,
    captionEditCost: 1,
  });
  assert.equal(DEFAULT_PLAN, "FREE");
  assert.equal(isPaidPlan("FREE"), false);
  assert.equal(isPaidPlan("SPARK_PLUS"), true);
  assert.equal(getPlanConfig("SPARK_ULTRA"), PLAN_CONFIG.SPARK_ULTRA);
});

test("billing period arithmetic is deterministic and clamps month ends", () => {
  assert.equal(
    addBillingMonths(new Date("2026-01-31T12:00:00Z"), 1).toISOString(),
    "2026-02-28T12:00:00.000Z",
  );
  assert.equal(
    addBillingMonths(new Date("2026-03-31T12:00:00Z"), 1).toISOString(),
    "2026-04-30T12:00:00.000Z",
  );
  assert.equal(
    addBillingMonths(new Date("2026-09-15T08:30:00Z"), 1).toISOString(),
    "2026-10-15T08:30:00.000Z",
  );
  // Same input → same output, always (no clock involved).
  const a = addBillingMonths(new Date("2026-09-26T00:00:00Z"), 1);
  const b = addBillingMonths(new Date("2026-09-26T00:00:00Z"), 1);
  assert.equal(a.getTime(), b.getTime());
});

test("schema defines the subscription foundation without payment states", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /enum SubscriptionPlan \{[^}]*FREE[^}]*SPARK_PLUS[^}]*SPARK_PRO[^}]*SPARK_ULTRA/);
  assert.match(schema, /enum SubscriptionStatus \{[^}]*ACTIVE[^}]*CANCELED[^}]*EXPIRED/);
  assert.match(schema, /model Subscription \{/);
  assert.match(schema, /userId\s+ String\s+ @unique/);
  assert.match(schema, /currentPeriodStart DateTime/);
  assert.match(schema, /currentPeriodEnd   DateTime/);
  // Ledger idempotency is per Spark kind so a spend can split across kinds.
  assert.match(schema, /@@unique\(\[userId, type, referenceId, sparkKind\]\)/);
  // No payment-provider lifecycle states in S4.
  assert.doesNotMatch(
    schema,
    /TRIALING|PAST_DUE|PAYMENT_FAILED/,
  );
  // No mutable aggregate balance on User.
  assert.doesNotMatch(schema, / sparks\s+ Int/);
});

test("spark service derives locked constants from the plan config", () => {
  const service = read("lib/spark-service.ts");
  // Locked S1 values remain visible/importable…
  assert.match(service, /FREE_DAILY_UPLOADS = 10/);
  assert.match(service, /EXTRA_UPLOAD_COST_SPARKS = 5/);
  assert.match(service, /CAPTION_EDIT_COST_SPARKS = 2/);
  assert.match(service, /DAILY_SPARK_EARNING_CAP = 10/);
  assert.match(service, /SPARK_PER_UPLOAD_REWARD = 1/);
  // …but are derived from PLAN_CONFIG, the single authority.
  assert.match(service, /getPlanConfig\(DEFAULT_PLAN\)/);
  // Costs are resolved per plan, never hard-coded in the spend path.
  const atomic = service.slice(service.indexOf("atomicSpendSparks"));
  assert.match(atomic, /resolveEffectivePlan/);
  assert.match(atomic, /planConfig\.extraUploadCost/);
  assert.match(atomic, /planConfig\.captionEditCost/);
  assert.doesNotMatch(atomic, /cost = 5|cost = 4|cost = 3|cost = 2/);
  // The usage summary communicates plan, sub/earned split, and period end.
  const summary = service.slice(service.indexOf("getSparkUsageSummary"));
  assert.match(summary, /plan,/);
  assert.match(summary, /subscriptionSparks:/);
  assert.match(summary, /earnedSparks:/);
  assert.match(summary, /subscriptionPeriodEnd/);
});

test("subscription service uses deterministic grant identity and no mutation-based expiration", () => {
  const source = read("lib/subscription-service.ts");
  // Deterministic reference: user + subscription + billing period.
  assert.match(source, /sub-grant:\$\{subscriptionId\}:\$\{periodStart\.toISOString\(\)\}/);
  // No clock/random identity for accounting operations.
  assert.doesNotMatch(source, /Date\.now\(\)|randomUUID/);
  // Serialized via row locking.
  assert.match(source, /FOR UPDATE/);
  // Grants expire with the billing period; expiration never rewrites history.
  assert.match(source, /expiresAt: subscription\.currentPeriodEnd/);
  assert.doesNotMatch(source, /SUBSCRIPTION_EXPIRATION/);
  assert.doesNotMatch(source, /sparkTransaction\.(delete|update)/);
  // Internal service operation, not a payment flow.
  assert.match(source, /export async function activateSubscription/);
  assert.doesNotMatch(source, /stripe|kpay|\bwebhook\b/i);
});

test("no purchase or activation endpoint exists (S4 scope protection)", () => {
  const apiRoutes = listFilesRecursively(
    resolve(import.meta.dirname, "..", "app", "api"),
  ).filter((file) => file.endsWith("route.ts"));

  for (const route of apiRoutes) {
    const body = readFileSync(route, "utf8");
    assert.ok(
      !body.includes("activateSubscription"),
      `route must not expose activateSubscription: ${route}`,
    );
    assert.ok(
      !route.includes("subscription"),
      `route must not be a subscription endpoint: ${route}`,
    );
  }

  const subscriptionService = read("lib/subscription-service.ts");
  assert.ok(!/buySubscription|createCheckout|startCheckout/i.test(subscriptionService));
});

test("upload and caption routes accept no client-provided plan", () => {
  const snapsRoute = read("app/api/snaps/route.ts");
  const captionRoute = read("app/api/snaps/[snapId]/caption/route.ts");
  for (const body of [snapsRoute, captionRoute]) {
    assert.doesNotMatch(body, /selectedPlan|subscriptionPlan|plan: z\./);
  }
  // Both keep using the server-authoritative summary.
  assert.match(snapsRoute, /getSparkUsageSummary/);
  assert.match(captionRoute, /getSparkUsageSummary/);
});

test("documentation covers S4 and defers payment integration", () => {
  const docs = read("docs/spark-economy.md");
  assert.match(docs, /## S4 — Subscription Foundation/);
  assert.match(docs, /PLAN_CONFIG/);
  assert.match(docs, /Grant idempotency/i);
  assert.match(docs, /Spending [Pp]riority/);
  assert.match(docs, /expired/i);
  assert.match(docs, /S4 = subscription\/accounting foundation|S4.*foundation/);
  assert.match(docs, /S7 = payment integration|S7.*payment integration/);
});

// ===========================================================================
// Free plan (Phase 13)
// ===========================================================================

test("free plan: no subscription row resolves to FREE with zero subscription Sparks", { skip: SKIP }, async () => {
  const { spark, sub } = await services();
  const userId = await createUser("s4sub_free_default");

  assert.equal(await sub.getEffectivePlan(userId), "FREE");

  const summary = await spark.getSparkUsageSummary(userId);
  assert.equal(summary.plan, "FREE");
  assert.equal(summary.subscriptionSparks, 0);
  assert.equal(summary.earnedSparks, 0);
  assert.equal(summary.subscriptionPeriodEnd, null);
  assert.equal(summary.balance, 0);
  assert.equal(summary.freeDailyUploads, 10);
  assert.equal(summary.extraUploadCost, 5);
  assert.equal(summary.captionEditCost, 2);

  // Earned Sparks work normally on the free plan.
  await seedSparks(userId, { amount: 5, kind: "EARNED" });
  const after = await spark.getSparkUsageSummary(userId);
  assert.equal(after.balance, 5);
  assert.equal(after.earnedSparks, 5);
  assert.equal(after.subscriptionSparks, 0);
  assert.equal(after.plan, "FREE");
});

// ===========================================================================
// Subscription grant + period (Phases 3, 15, 16)
// ===========================================================================

test("Spark+ activation grants 100 subscription Sparks and stores the period", { skip: SKIP }, async () => {
  const { spark, sub } = await services();
  const client = await db();
  const userId = await createUser("s4sub_grant_plus");

  const result = await sub.activateSubscription({
    userId,
    plan: "SPARK_PLUS",
  });

  assert.equal(result.created, true);
  assert.equal(result.grant.granted, true);
  assert.equal(result.grant.amount, 100);
  assert.equal(result.subscription.plan, "SPARK_PLUS");
  assert.equal(result.subscription.status, "ACTIVE");

  // Deterministic period: explicit start/end, end = start + 1 calendar month.
  const { currentPeriodStart, currentPeriodEnd } = result.subscription;
  assert.ok(currentPeriodStart.getTime() <= Date.now());
  assert.ok(currentPeriodEnd.getTime() > Date.now());
  assert.equal(
    currentPeriodEnd.toISOString(),
    addBillingMonths(currentPeriodStart, 1).toISOString(),
  );

  // The grant is a real ledger transaction of the specified shape.
  const grant = await client.sparkTransaction.findFirst({
    where: { userId, type: "SUBSCRIPTION_GRANT" },
  });
  assert.ok(grant);
  assert.equal(grant.amount, 100);
  assert.equal(grant.source, "SUBSCRIPTION");
  assert.equal(grant.sparkKind, "SUBSCRIPTION");
  assert.equal(grant.expiresAt?.toISOString(), currentPeriodEnd.toISOString());
  assert.match(grant.referenceId, /^sub-grant:.+:.+$/);

  const balance = await spark.getSparkBalance(userId);
  assert.equal(balance.subscription, 100);
  assert.equal(balance.earned, 0);
  assert.equal(balance.total, 100);

  const summary = await spark.getSparkUsageSummary(userId);
  assert.equal(summary.plan, "SPARK_PLUS");
  assert.equal(summary.subscriptionSparks, 100);
  assert.equal(summary.earnedSparks, 0);
  assert.equal(summary.balance, 100);
  assert.equal(
    summary.subscriptionPeriodEnd,
    currentPeriodEnd.toISOString(),
  );
  assert.equal(summary.extraUploadCost, 4);
  assert.equal(summary.captionEditCost, 1);
  assert.equal(summary.freeDailyUploads, 10);
});

test("free → paid transition is established by the internal service operation", { skip: SKIP }, async () => {
  const { sub } = await services();
  const userId = await createUser("s4sub_transition_free_to_plus");

  const before = await sub.getSubscription(userId);
  assert.equal(before, null);

  const activated = await sub.activateSubscription({
    userId,
    plan: "SPARK_PLUS",
  });
  assert.equal(activated.created, true);
  assert.equal(activated.subscription.status, "ACTIVE");
  assert.ok(activated.subscription.currentPeriodEnd > new Date());

  // A conflicting paid plan while active is deferred (no proration invention).
  await assert.rejects(
    () => sub.activateSubscription({ userId, plan: "SPARK_PRO" }),
    (error: unknown) => {
      assert.ok(error instanceof sub.SubscriptionServiceError);
      assert.equal(error.code, "already_active");
      return true;
    },
  );

  // Replaying the identical activation is idempotent: no second grant.
  const replay = await sub.activateSubscription({
    userId,
    plan: "SPARK_PLUS",
  });
  assert.equal(replay.created, false);
  assert.equal(replay.grant.idempotent, true);
  assert.equal(replay.grant.amount, 0);
});

// ===========================================================================
// Grant idempotency (Phase 4, 18)
// ===========================================================================

test("grant idempotency: same billing period granted many times yields exactly one grant", { skip: SKIP }, async () => {
  const { spark, sub } = await services();
  const client = await db();
  const userId = await createUser("s4sub_grant_idempotent");

  const activated = await sub.activateSubscription({
    userId,
    plan: "SPARK_PLUS",
  });
  const subscription = await sub.getSubscription(userId);
  assert.ok(subscription);

  // Direct repeated grants for the same period.
  const repeat1 = await client.$transaction((tx) =>
    sub.grantSubscriptionSparks(tx, subscription),
  );
  const repeat2 = await client.$transaction((tx) =>
    sub.grantSubscriptionSparks(tx, subscription),
  );
  assert.equal(repeat1.granted, false);
  assert.equal(repeat1.idempotent, true);
  assert.equal(repeat2.granted, false);
  assert.equal(repeat2.idempotent, true);
  assert.equal(repeat1.transactionId, activated.grant.transactionId);

  // Concurrent grants for the same period → still one.
  const [concA, concB] = await Promise.all([
    client.$transaction((tx) => sub.grantSubscriptionSparks(tx, subscription)),
    client.$transaction((tx) => sub.grantSubscriptionSparks(tx, subscription)),
  ]);
  assert.equal([concA, concB].filter((r) => r.granted).length <= 1, true);

  const grantCount = await client.sparkTransaction.count({
    where: { userId, type: "SUBSCRIPTION_GRANT" },
  });
  assert.equal(grantCount, 1);

  const balance = await spark.getSparkBalance(userId);
  assert.equal(balance.subscription, 100, "must receive the allocation only once");
});

test("concurrent activations produce exactly one subscription and one grant", { skip: SKIP }, async () => {
  const { spark, sub } = await services();
  const client = await db();
  const userId = await createUser("s4sub_concurrent_activation");

  const results = await Promise.all([
    sub.activateSubscription({ userId, plan: "SPARK_PLUS" }),
    sub.activateSubscription({ userId, plan: "SPARK_PLUS" }),
  ]);

  const subscriptionCount = await client.subscription.count({
    where: { userId },
  });
  assert.equal(subscriptionCount, 1);
  assert.equal(results.filter((r) => r.created).length, 1);

  const grantCount = await client.sparkTransaction.count({
    where: { userId, type: "SUBSCRIPTION_GRANT" },
  });
  assert.equal(grantCount, 1);

  const balance = await spark.getSparkBalance(userId);
  assert.equal(balance.subscription, 100);
});

// ===========================================================================
// Expiration + earned permanence (Phases 5, 6)
// ===========================================================================

test("expiration: subscription Sparks become unavailable, earned Sparks remain, ledger untouched", { skip: SKIP }, async () => {
  const { spark, sub } = await services();
  const client = await db();
  const userId = await createUser("s4sub_expiration");

  await seedSparks(userId, { amount: 20, kind: "EARNED" });

  // Activate with a period that already ended (35 days ago + 1 month).
  const periodStart = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
  const activated = await sub.activateSubscription({
    userId,
    plan: "SPARK_PLUS",
    periodStart,
  });
  const periodEnd = activated.subscription.currentPeriodEnd;
  assert.ok(periodEnd.getTime() < Date.now(), "fixture period must be over");

  // Grant still exists — the ledger is never rewritten or deleted.
  const grant = await client.sparkTransaction.findFirst({
    where: { userId, type: "SUBSCRIPTION_GRANT" },
  });
  assert.ok(grant);
  assert.equal(grant.amount, 100);
  assert.equal(grant.expiresAt?.toISOString(), periodEnd.toISOString());

  // Expired subscription Sparks are simply unavailable; earned untouched.
  const balance = await spark.getSparkBalance(userId);
  assert.equal(balance.subscription, 0);
  assert.equal(balance.earned, 20);
  assert.equal(balance.total, 20);

  const summary = await spark.getSparkUsageSummary(userId);
  assert.equal(summary.plan, "FREE");
  assert.equal(summary.subscriptionSparks, 0);
  assert.equal(summary.earnedSparks, 20);
  assert.equal(summary.subscriptionPeriodEnd, null);

  // Status sweep is pure bookkeeping, idempotent, and touches no ledger rows.
  const sweep1 = await sub.expireDueSubscriptions();
  const sweep2 = await sub.expireDueSubscriptions();
  assert.ok(sweep1.expired >= 1);
  assert.equal(sweep2.expired, 0);
  const row = await sub.getSubscription(userId);
  assert.equal(row?.status, "EXPIRED");

  // Spending now uses the FREE plan rules and never touches expired Sparks.
  const spend = await spark.spendSparks({
    userId,
    type: "EXTRA_SNAP_UPLOAD",
    referenceId: "s4-expired-spend",
  });
  assert.equal(spend.amountDeducted, 5, "FREE plan cost applies after expiry");
  assert.equal(spend.subscriptionPortion, 0);
  assert.equal(spend.earnedPortion, 5);

  const finalBalance = await spark.getSparkBalance(userId);
  assert.equal(finalBalance.subscription, 0);
  assert.equal(finalBalance.earned, 15);

  // The original grant row is still present and unchanged.
  const grantAfter = await client.sparkTransaction.findUnique({
    where: { id: grant.id },
  });
  assert.equal(grantAfter?.amount, 100);
  assert.equal(grantAfter?.expiresAt?.toISOString(), periodEnd.toISOString());
});

test("reactivation after expiry starts a new period with a fresh grant (old grant stays expired)", { skip: SKIP }, async () => {
  const { spark, sub } = await services();
  const client = await db();
  const userId = await createUser("s4sub_renewal");

  const periodStart = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
  await sub.activateSubscription({ userId, plan: "SPARK_PLUS", periodStart });

  const reactivated = await sub.activateSubscription({
    userId,
    plan: "SPARK_PRO",
  });
  assert.equal(reactivated.created, true);
  assert.equal(reactivated.grant.granted, true);
  assert.equal(reactivated.grant.amount, 300);
  assert.ok(
    reactivated.subscription.currentPeriodEnd.getTime() > Date.now(),
    "new period must be in the future",
  );

  const grants = await client.sparkTransaction.findMany({
    where: { userId, type: "SUBSCRIPTION_GRANT" },
    orderBy: { createdAt: "asc" },
  });
  assert.equal(grants.length, 2, "one grant per billing period, both preserved");
  assert.equal(grants[0].amount, 100, "historical grant is not mutated");
  assert.equal(grants[1].amount, 300);

  // Only the new period's Sparks are available.
  const balance = await spark.getSparkBalance(userId);
  assert.equal(balance.subscription, 300);
});

test("expiration boundary: expired grant and its debits vanish together (no negative residue)", { skip: SKIP }, async () => {
  const { spark } = await services();
  const userId = await createUser("s4sub_boundary_residue");

  const past = new Date("2026-01-01T00:00:00.000Z");
  const future = new Date("2099-01-01T00:00:00.000Z");

  // Expired period: grant + spend both in the past.
  await seedSparks(userId, { amount: 100, kind: "SUBSCRIPTION", expiresAt: past });
  await seedSparks(userId, { amount: -4, kind: "SUBSCRIPTION", expiresAt: past, type: "EXTRA_SNAP_UPLOAD" });
  // Active period: grant + spend both in the future.
  await seedSparks(userId, { amount: 100, kind: "SUBSCRIPTION", expiresAt: future });
  await seedSparks(userId, { amount: -4, kind: "SUBSCRIPTION", expiresAt: future, type: "EXTRA_SNAP_UPLOAD" });
  await seedSparks(userId, { amount: 10, kind: "EARNED" });

  const balance = await spark.getSparkBalance(userId);
  // 100 - 4 (active only; the expired pair is excluded entirely).
  assert.equal(balance.subscription, 96);
  assert.equal(balance.earned, 10);
  assert.equal(balance.total, 106);
  assert.ok(balance.subscription >= 0, "balance must never be negative");
});

// ===========================================================================
// Spending priority + atomicity (Phases 7, 8, 18)
// ===========================================================================

test("spending priority: subscription 3, earned 10, spend 5 → sub 0, earned 8", { skip: SKIP }, async () => {
  const { spark } = await services();
  const client = await db();
  const userId = await createUser("s4sub_priority_split");

  await seedSparks(userId, {
    amount: 3,
    kind: "SUBSCRIPTION",
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  });
  await seedSparks(userId, { amount: 10, kind: "EARNED" });

  const result = await spark.spendSparks({
    userId,
    type: "EXTRA_SNAP_UPLOAD",
    referenceId: "s4-priority-1",
  });
  assert.equal(result.idempotent, false);
  assert.equal(result.amountDeducted, 5);
  assert.equal(result.subscriptionPortion, 3);
  assert.equal(result.earnedPortion, 2);

  const balance = await spark.getSparkBalance(userId);
  assert.equal(balance.subscription, 0);
  assert.equal(balance.earned, 8);

  // One debit row per Spark kind, same logical reference.
  const debits = await client.sparkTransaction.findMany({
    where: { userId, type: "EXTRA_SNAP_UPLOAD", referenceId: "s4-priority-1" },
  });
  assert.equal(debits.length, 2);
  const subDebit = debits.find((d) => d.sparkKind === "SUBSCRIPTION");
  const earnedDebit = debits.find((d) => d.sparkKind === "EARNED");
  assert.equal(subDebit?.amount, -3);
  assert.equal(earnedDebit?.amount, -2);

  // Replay returns the original charge, never a second one.
  const replay = await spark.spendSparks({
    userId,
    type: "EXTRA_SNAP_UPLOAD",
    referenceId: "s4-priority-1",
  });
  assert.equal(replay.idempotent, true);
  assert.equal(replay.amountDeducted, 5);
  assert.equal(replay.subscriptionPortion, 3);
  assert.equal(replay.earnedPortion, 2);
  assert.equal(replay.transactionId, result.transactionId);
  const afterReplay = await spark.getSparkBalance(userId);
  assert.equal(afterReplay.total, 8);
});

test("spend entirely from subscription: sub 10, earned 5, spend 4 → sub 6, earned 5", { skip: SKIP }, async () => {
  const { spark, sub } = await services();
  const client = await db();
  const userId = await createUser("s4sub_spend_all_sub");

  // Spark+ fixture: active subscription + a 10-Spark grant for this period.
  const now = new Date();
  const periodEnd = addBillingMonths(now, 1);
  await client.subscription.create({
    data: {
      userId,
      plan: "SPARK_PLUS",
      status: "ACTIVE",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
  });
  await seedSparks(userId, {
    amount: 10,
    kind: "SUBSCRIPTION",
    expiresAt: periodEnd,
  });
  await seedSparks(userId, { amount: 5, kind: "EARNED" });

  assert.equal(await sub.getEffectivePlan(userId), "SPARK_PLUS");

  const result = await spark.spendSparks({
    userId,
    type: "EXTRA_SNAP_UPLOAD",
    referenceId: "s4-spend-all-sub",
  });
  assert.equal(result.amountDeducted, 4, "Spark+ extra upload costs 4");
  assert.equal(result.subscriptionPortion, 4);
  assert.equal(result.earnedPortion, 0);

  const balance = await spark.getSparkBalance(userId);
  assert.equal(balance.subscription, 6);
  assert.equal(balance.earned, 5);

  // The subscription debit is tied to the same billing-period boundary.
  const subDebit = await client.sparkTransaction.findFirst({
    where: {
      userId,
      type: "EXTRA_SNAP_UPLOAD",
      referenceId: "s4-spend-all-sub",
      sparkKind: "SUBSCRIPTION",
    },
  });
  assert.ok(subDebit);
  assert.equal(subDebit.expiresAt?.toISOString(), periodEnd.toISOString());
});

test("insufficient combined balance is rejected with balances unchanged", { skip: SKIP }, async () => {
  const { spark } = await services();
  const client = await db();
  const userId = await createUser("s4sub_insufficient_combined");

  await seedSparks(userId, {
    amount: 1,
    kind: "SUBSCRIPTION",
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  });
  await seedSparks(userId, { amount: 2, kind: "EARNED" });

  await assert.rejects(
    () =>
      spark.spendSparks({
        userId,
        type: "EXTRA_SNAP_UPLOAD",
        referenceId: "s4-insufficient",
      }),
    (error: unknown) => {
      assert.ok(error instanceof spark.SparkServiceError);
      assert.equal(error.code, "insufficient_sparks");
      return true;
    },
  );

  const balance = await spark.getSparkBalance(userId);
  assert.equal(balance.subscription, 1);
  assert.equal(balance.earned, 2);
  assert.equal(
    await client.sparkTransaction.count({
      where: { userId, type: "EXTRA_SNAP_UPLOAD", referenceId: "s4-insufficient" },
    }),
    0,
  );
});

test("concurrent spending never goes negative or double-spends", { skip: SKIP }, async () => {
  const { spark } = await services();

  // Three parallel spends of 5 against a balance of 10.
  const userId = await createUser("s4sub_concurrent_spend");
  await seedSparks(userId, { amount: 10, kind: "EARNED" });
  const results = await Promise.allSettled([
    spark.spendSparks({ userId, type: "EXTRA_SNAP_UPLOAD", referenceId: "s4-conc-a" }),
    spark.spendSparks({ userId, type: "EXTRA_SNAP_UPLOAD", referenceId: "s4-conc-b" }),
    spark.spendSparks({ userId, type: "EXTRA_SNAP_UPLOAD", referenceId: "s4-conc-c" }),
  ]);
  const succeeded = results.filter((r) => r.status === "fulfilled");
  assert.ok(succeeded.length <= 2, `at most 2 spends of 5 from 10, got ${succeeded.length}`);
  const balance = await spark.getSparkBalance(userId);
  assert.equal(balance.total, 10 - 5 * succeeded.length);
  assert.ok(balance.total >= 0, "balance must never be negative");

  // Two parallel spends with the SAME logical key charge exactly once.
  const idemUserId = await createUser("s4sub_concurrent_same_key");
  await seedSparks(idemUserId, { amount: 10, kind: "EARNED" });
  const sameKey = "s4-same-key";
  const [sameA, sameB] = await Promise.all([
    spark.spendSparks({ userId: idemUserId, type: "EXTRA_SNAP_UPLOAD", referenceId: sameKey }),
    spark.spendSparks({ userId: idemUserId, type: "EXTRA_SNAP_UPLOAD", referenceId: sameKey }),
  ]);
  assert.equal(sameA.amountDeducted, 5);
  assert.equal(sameB.amountDeducted, 5);
  const sameKeyBalance = await spark.getSparkBalance(idemUserId);
  assert.equal(sameKeyBalance.total, 5, "same logical key charges exactly once");
  const client = await db();
  assert.equal(
    await client.sparkTransaction.count({
      where: { userId: idemUserId, type: "EXTRA_SNAP_UPLOAD", referenceId: sameKey },
    }),
    1,
    "one debit row for one logical charge",
  );
});

// ===========================================================================
// Plan-aware rules (Phases 11, 12)
// ===========================================================================

test("plan-aware upload rules: each plan's free uploads/day and extra upload cost", { skip: SKIP }, async () => {
  const { spark, sub } = await services();
  const cases = [
    { plan: "FREE" as const, uploads: 10, extra: 5 },
    { plan: "SPARK_PLUS" as const, uploads: 10, extra: 4 },
    { plan: "SPARK_PRO" as const, uploads: 10, extra: 3 },
    { plan: "SPARK_ULTRA" as const, uploads: 15, extra: 2 },
  ];

  for (const c of cases) {
    const userId = await createUser(`s4sub_plan_${c.plan.toLowerCase()}`);
    if (c.plan !== "FREE") {
      await sub.activateSubscription({ userId, plan: c.plan });
    }

    const usage = await spark.getSparkUsageSummary(userId);
    assert.equal(usage.plan, c.plan);
    assert.equal(usage.freeDailyUploads, c.uploads, `${c.plan} free uploads/day`);
    assert.equal(usage.extraUploadCost, c.extra, `${c.plan} extra upload cost`);

    // The spend path applies the same plan cost (server-authoritative).
    await seedSparks(userId, { amount: 20, kind: "EARNED" });
    const spend = await spark.spendSparks({
      userId,
      type: "EXTRA_SNAP_UPLOAD",
      referenceId: `s4-plan-cost-${c.plan}`,
    });
    assert.equal(spend.amountDeducted, c.extra, `${c.plan} charged extra cost`);

    const daily = await spark.getDailyUploadUsage(userId);
    assert.equal(daily.freeUploadsRemaining, c.uploads, `${c.plan} allowance`);
  }
});

test("plan-aware upload behavior: Spark Ultra gets 15 free uploads and pays 2 after", { skip: SKIP }, async () => {
  const { spark, sub, upload } = await services();
  const client = await db();
  const userId = await createUser("s4sub_ultra_uploads");
  await sub.activateSubscription({ userId, plan: "SPARK_ULTRA" });

  const now = new Date();
  await seedSparks(userId, { amount: 5, kind: "EARNED" });

  // Consume 14 of the 15 free slots directly…
  for (let i = 0; i < 14; i++) {
    const r = await spark.incrementDailyUploadCounter(
      client,
      userId,
      now,
      PLAN_CONFIG.SPARK_ULTRA.freeUploadsPerDay,
    );
    assert.ok(r, `free slot ${i + 1} must succeed`);
  }

  // …the 15th upload is still free (Spark Ultra's plan allowance)…
  const freeUpload = await upload.createSnapWithSparkAccounting({
    targetUserId: userId,
    uploadedById: userId,
    imageUrl: "https://res.cloudinary.com/test/image/upload/s4-ultra-free.jpg",
    publicId: "test/s4-ultra-free",
    idempotencyKey: "s4-ultra-free-upload",
  });
  assert.equal(freeUpload.isFreeUpload, true, "15th upload must be free on Ultra");
  assert.equal(freeUpload.sparkRewardCredited, true);

  const usage = await spark.getDailyUploadUsage(userId, now);
  assert.equal(usage.freeUploadsUsed, 15);
  assert.equal(usage.freeUploadsRemaining, 0);
  assert.equal(usage.dailyLimitReached, true);

  // …and the 16th upload is paid at the Spark Ultra cost of 2.
  const paidUpload = await upload.createSnapWithSparkAccounting({
    targetUserId: userId,
    uploadedById: userId,
    imageUrl: "https://res.cloudinary.com/test/image/upload/s4-ultra-paid.jpg",
    publicId: "test/s4-ultra-paid",
    idempotencyKey: "s4-ultra-paid-upload",
  });
  assert.equal(paidUpload.isFreeUpload, false);
  assert.equal(paidUpload.sparkRewardCredited, false);
  assert.equal(paidUpload.sparkSpent, 2, "Spark Ultra extra upload costs 2");

  // 5 earned + 1 free-upload reward − 2 paid upload (subscription-first).
  const balance = await spark.getSparkBalance(userId);
  assert.equal(balance.earned, 6);
  assert.equal(balance.subscription, 998, "paid upload consumed subscription Sparks first");
  assert.equal(balance.total, 1004);
});

test("plan-aware caption edit: Free = 2, Spark+ / Pro / Ultra = 1", { skip: SKIP }, async () => {
  const { spark, sub, caption } = await services();
  const cases = [
    { plan: "FREE" as const, cost: 2 },
    { plan: "SPARK_PLUS" as const, cost: 1 },
    { plan: "SPARK_PRO" as const, cost: 1 },
    { plan: "SPARK_ULTRA" as const, cost: 1 },
  ];

  for (const c of cases) {
    const userId = await createUser(`s4sub_caption_${c.plan.toLowerCase()}`);
    if (c.plan !== "FREE") {
      await sub.activateSubscription({ userId, plan: c.plan });
    }
    await seedSparks(userId, { amount: 10, kind: "EARNED" });
    const snap = await createSnap(userId, "before");

    const result = await caption.updateSnapCaptionWithSparkAccounting({
      userId,
      snapId: snap.id,
      caption: `after ${c.plan}`,
      idempotencyKey: `s4-caption-${c.plan}-${snap.id}`,
    });

    assert.equal(result.snap.caption, `after ${c.plan}`);
    assert.equal(result.sparkSpent, c.cost, `${c.plan} caption edit cost`);

    // Paid plans draw the edit from their subscription Sparks first;
    // the FREE plan draws from earned Sparks.
    const grant = PLAN_CONFIG[c.plan].subscriptionSparks;
    const balance = await spark.getSparkBalance(userId);
    assert.equal(
      balance.total,
      grant + 10 - c.cost,
      `${c.plan} total balance after edit`,
    );
    assert.equal(
      balance.earned,
      grant > 0 ? 10 : 10 - c.cost,
      `${c.plan} earned Sparks after edit`,
    );
    assert.equal(
      balance.subscription,
      grant > 0 ? grant - c.cost : 0,
      `${c.plan} subscription Sparks after edit`,
    );
  }
});

// ===========================================================================
// Subscription period + status semantics (Phases 14, 15)
// ===========================================================================

test("subscription status and period evaluation rules", { skip: SKIP }, async () => {
  const { sub } = await services();
  const now = new Date("2026-09-26T00:00:00.000Z");
  const future = new Date("2026-10-10T00:00:00.000Z");
  const past = new Date("2026-09-01T00:00:00.000Z");

  const base = {
    plan: "SPARK_PLUS" as const,
    currentPeriodStart: past,
    currentPeriodEnd: future,
  };

  // ACTIVE within period → paid plan.
  assert.equal(
    sub.resolveEffectivePlan({ ...base, status: "ACTIVE" }, now),
    "SPARK_PLUS",
  );
  // CANCELED still confers benefits until period end (non-renewing only).
  assert.equal(
    sub.resolveEffectivePlan({ ...base, status: "CANCELED" }, now),
    "SPARK_PLUS",
  );
  // EXPIRED is terminal → FREE.
  assert.equal(
    sub.resolveEffectivePlan({ ...base, status: "EXPIRED" }, now),
    "FREE",
  );
  // ACTIVE but past period end → FREE (no sweep required for safety).
  assert.equal(
    sub.resolveEffectivePlan(
      { ...base, status: "ACTIVE", currentPeriodEnd: past },
      now,
    ),
    "FREE",
  );
  // No row at all → FREE (never ambiguous).
  assert.equal(sub.resolveEffectivePlan(null, now), "FREE");
  // FREE rows stay FREE.
  assert.equal(
    sub.resolveEffectivePlan(
      { plan: "FREE", status: "ACTIVE", currentPeriodEnd: future },
      now,
    ),
    "FREE",
  );
});

test("cancelSubscription is a service-level operation that keeps period benefits", { skip: SKIP }, async () => {
  const { spark, sub } = await services();
  const userId = await createUser("s4sub_cancel");

  await sub.activateSubscription({ userId, plan: "SPARK_PLUS" });
  const { subscription } = await sub.cancelSubscription(userId);
  assert.equal(subscription.status, "CANCELED");

  // Benefits continue until the period end; grants are not revoked.
  assert.equal(await sub.getEffectivePlan(userId), "SPARK_PLUS");
  const balance = await spark.getSparkBalance(userId);
  assert.equal(balance.subscription, 100);
});
