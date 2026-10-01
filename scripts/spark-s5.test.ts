/**
 * S5 — Spark UI Foundation tests.
 *
 * Source-level tests always run. Database-backed tests use only users
 * created by this file (prefix `s5ui_`) and skip when DATABASE_URL is
 * unavailable.
 *
 * Coverage: the derived `subscriptionStatus` summary field (additive only —
 * no schema/migration change), the profile Sparks card rendering
 * server-authoritative values only, absence of client-side economy math and
 * pricing/payment UI, shared profile integration (Web + Telegram Mini App),
 * documentation, and live summary behavior for Free / active / canceled /
 * expired subscriptions.
 *
 * Run: npm run test:spark-s5
 */
import "./test-db-guard";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import type { PrismaClient } from "@prisma/client";

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
  const [spark, sub] = await Promise.all([
    import("../lib/spark-service"),
    import("../lib/subscription-service"),
  ]);
  return { spark, sub };
}

async function createUser(name: string): Promise<string> {
  const client = await db();
  const user = await client.user.create({
    data: { name, profileImage: "https://example.com/s5-test.jpg" },
  });
  testUserIds.push(user.id);
  return user.id;
}

async function seedSparks(
  userId: string,
  opts: { amount: number; kind: "EARNED" | "SUBSCRIPTION" },
) {
  const client = await db();
  return client.sparkTransaction.create({
    data: {
      userId,
      amount: opts.amount,
      type: opts.kind === "EARNED" ? "ADMIN_ADJUSTMENT" : "SUBSCRIPTION_GRANT",
      source: opts.kind === "EARNED" ? "ADMIN" : "SUBSCRIPTION",
      sparkKind: opts.kind,
      expiresAt: null,
      referenceType: "s5-test",
      referenceId: `s5-seed-${userId}-${Date.now()}-${++sequence}`,
    },
  });
}

before(async () => {
  if (!hasDb) return;
  const client = await db();
  // Clean leftovers from previous (possibly failed) runs of THIS file only.
  await client.user.deleteMany({ where: { name: { startsWith: "s5ui_" } } });
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

test("SparkUsageSummary exposes subscriptionStatus and preserves every existing field", () => {
  const usage = read("lib/spark-usage.ts");

  // S5 additive field: derived status with a null Free state.
  assert.match(usage, /SubscriptionPlan,\s*SubscriptionStatus,/);
  assert.match(usage, /subscriptionStatus: SubscriptionStatus \| null/);

  // Every pre-existing summary field must remain intact (S5 is additive).
  const existingFields = [
    "balance",
    "plan",
    "subscriptionSparks",
    "earnedSparks",
    "subscriptionPeriodEnd",
    "freeUploadsUsed",
    "freeUploadsRemaining",
    "freeDailyUploads",
    "dailyEarnedSparks",
    "dailyEarnRemaining",
    "dailyEarningCap",
    "extraUploadCost",
    "captionEditCost",
    "canAffordCaptionEdit",
    "uploadReward",
    "nextUploadIsPaid",
    "canAffordNextUpload",
  ];
  for (const field of existingFields) {
    assert.match(
      usage,
      new RegExp(`\\b${field}:`),
      `summary field must remain: ${field}`,
    );
  }
});

test("subscriptionStatus is derived server-side with no schema or migration change", () => {
  const service = read("lib/spark-service.ts");
  const summary = service.slice(service.indexOf("getSparkUsageSummary"));

  assert.match(summary, /subscriptionStatus/);
  // Derived from the existing subscription row + the same active check the
  // plan resolution uses — never a new database field.
  assert.match(summary, /isSubscriptionActive\(subscription, now\)/);
  assert.match(summary, /subscription\.status/);
  assert.match(summary, /"EXPIRED"/);
  assert.match(summary, /subscription\.plan !== DEFAULT_PLAN/);

  // Existing summary projection is untouched.
  assert.match(summary, /plan,/);
  assert.match(summary, /subscriptionSparks:/);
  assert.match(summary, /earnedSparks:/);
  assert.match(summary, /subscriptionPeriodEnd/);

  // No schema field, no migration: display-only derivation.
  const schema = read("prisma/schema.prisma");
  assert.doesNotMatch(schema, /subscriptionStatus/);

  const migrationsDir = resolve(
    import.meta.dirname,
    "..",
    "prisma",
    "migrations",
  );
  const migrations = readdirSync(migrationsDir, { withFileTypes: true });
  assert.equal(
    migrations.some((entry) => /s5|spark.?ui/i.test(entry.name)),
    false,
    "S5 must not add a migration",
  );
  for (const file of listFilesRecursively(migrationsDir)) {
    assert.ok(
      !readFileSync(file, "utf8").includes("subscriptionStatus"),
      `migration must not define subscriptionStatus: ${file}`,
    );
  }
});

test("profile Sparks card renders only server-provided summary values", () => {
  const card = read("components/sparks/SparkBalanceCard.tsx");

  // Server-authoritative source.
  assert.match(card, /useSparkUsage/);
  assert.match(card, /usage\.balance/);
  assert.match(card, /usage\.earnedSparks/);
  assert.match(card, /usage\.subscriptionSparks/);
  assert.match(card, /usage\.plan/);
  assert.match(card, /usage\.subscriptionStatus/);
  assert.match(card, /usage\.subscriptionPeriodEnd/);

  // Native profile visual language.
  assert.match(
    card,
    /rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6/,
  );
  assert.match(
    card,
    /text-sm font-semibold uppercase tracking-wide text-muted-foreground/,
  );

  // Loading + error conventions: no fabricated balance while loading or on
  // failure.
  assert.match(card, /Skeleton/);
  assert.match(card, /role="alert"/);

  // No period end is ever rendered unconditionally (Free state shows none).
  assert.match(card, /usage\.subscriptionPeriodEnd \?/);
});

test("profile Sparks card has no client-side economy math, hard-coded costs, or pricing", () => {
  const card = read("components/sparks/SparkBalanceCard.tsx");

  // No plan prices anywhere (pricing is a later milestone).
  assert.doesNotMatch(card, /(?:29,?000|59,?000|99,?000)/);
  assert.doesNotMatch(card, /MMK/i);

  // No client-side balance math on server fields.
  assert.doesNotMatch(card, /usage\.(?:balance|earnedSparks|subscriptionSparks)\s*[-+*/]/);
  // No client-side affordability decision.
  assert.doesNotMatch(card, /\bcanAfford/);
  // The card displays no costs at all — costs live in the upload/caption UI.
  assert.doesNotMatch(card, /\bextraUploadCost\b/);
  assert.doesNotMatch(card, /\bcaptionEditCost\b/);
});

test("S5 UI remains display-only while S7-A adds no payment functionality", () => {
  const files = [
    "components/sparks/SparkBalanceCard.tsx",
    "components/profile/ProfilePageClient.tsx",
    "lib/spark-usage.ts",
    "lib/spark-service.ts",
  ];
  const boundary =
    /checkout|purchase|KPay|AYA Pay|UAB Pay|Stripe|payment webhook|Spark pack/i;
  for (const file of files) {
    assert.doesNotMatch(read(file), boundary, `no payment content: ${file}`);
  }

  // S5 remains display-only. S7-A adds only authenticated purchase-intent
  // and cancellation routes; none can activate or verify payment.
  const purchaseRoute = read("app/api/subscription/purchases/route.ts");
  const statusRoute = read("app/api/subscription/purchases/[id]/route.ts");
  const cancelRoute = read("app/api/subscription/cancel/route.ts");
  for (const route of [purchaseRoute, statusRoute, cancelRoute]) {
    assert.match(route, /requireAuthenticatedAppUser/);
    assert.doesNotMatch(route, /activateSubscription|fulfillVerifiedPurchase|paymentSucceededAt/);
  }
  const fulfillmentRoute = resolve(
    import.meta.dirname,
    "..",
    "app",
    "api",
    "subscription",
    "purchases",
    "[id]",
    "fulfill",
    "route.ts",
  );
  assert.equal(existsSync(fulfillmentRoute), false);

  const sparkRoutes = listFilesRecursively(
    resolve(import.meta.dirname, "..", "app", "api", "sparks"),
  ).filter((file) => file.endsWith("route.ts"));
  assert.equal(sparkRoutes.length, 1);
  assert.ok(sparkRoutes[0].endsWith("/sparks/usage/route.ts"));

  // The profile itself never links into the (unrelated) payment page.
  const profile = read("components/profile/ProfilePageClient.tsx");
  assert.doesNotMatch(profile, /\/profile\/payment\?feature=profile-photo/);
});

test("ProfilePageClient renders the Sparks card and Telegram keeps the shared profile", () => {
  const profile = read("components/profile/ProfilePageClient.tsx");
  assert.match(profile, /import SparkBalanceCard/);
  assert.match(profile, /<SparkBalanceCard \/>/);
  // Existing profile contract stays intact.
  assert.match(profile, /SnapGallery/);
  assert.match(profile, /canEditCaptions/);
  assert.match(profile, /TelegramConnectButton/);

  const telegramProfile = read("components/telegram/TelegramMiniAppProfile.tsx");
  assert.match(telegramProfile, /ProfilePageClient/);
  assert.match(telegramProfile, /homeHref/);
});

test("locked S2/S3 UI strings remain unchanged", () => {
  const indicator = read("components/snaps/SparkUsageIndicator.tsx");
  assert.match(
    indicator,
    /Free uploads today: \{usage\.freeUploadsUsed\} \/ \{usage\.freeDailyUploads\}/,
  );

  const composer = read("components/snaps/SnapCreateComposerModal.tsx");
  assert.match(
    composer,
    /Use \{usage\.extraUploadCost\} Sparks to upload this Snap\?/,
  );
  assert.match(composer, /Upload for \{usage\.extraUploadCost\} Sparks/);

  const viewer = read("components/snaps/SnapViewer.tsx");
  assert.match(
    viewer,
    /Edit caption for \{usage\.captionEditCost\} Sparks/,
  );
  assert.match(viewer, /Save for \{usage\.captionEditCost\} Sparks/);
  assert.match(viewer, /No Sparks spent/);
});

test("documentation covers S5 without pricing and keeps S7 as payment integration", () => {
  const docs = read("docs/spark-economy.md");
  assert.match(docs, /## S5 — Spark UI Foundation/);

  const s5 = docs.slice(docs.indexOf("## S5 — Spark UI Foundation"));
  assert.match(s5, /profile Sparks card/i);
  assert.match(s5, /subscriptionStatus/);
  assert.match(s5, /server-authoritative/i);
  assert.match(s5, /S7/);
  // No pricing and no payment providers in the S5 section.
  assert.doesNotMatch(s5, /(?:29,?000|59,?000|99,?000)/);
  assert.doesNotMatch(s5, /KPay|AYA Pay|UAB Pay|Stripe/i);

  // S1–S4 sections remain present (not rewritten).
  assert.match(docs, /## S2 — Snap Integration/);
  assert.match(docs, /## S3 — Caption Editing/);
  assert.match(docs, /## S4 — Subscription Foundation/);
});

// ===========================================================================
// Live summary behavior (skipped without DATABASE_URL)
// ===========================================================================

test("free user: summary reports the Free state with no fabricated subscription", { skip: SKIP }, async () => {
  const { spark } = await services();
  const userId = await createUser("s5ui_free");

  const summary = await spark.getSparkUsageSummary(userId);
  assert.equal(summary.plan, "FREE");
  assert.equal(summary.subscriptionStatus, null);
  assert.equal(summary.subscriptionSparks, 0);
  assert.equal(summary.subscriptionPeriodEnd, null);
  assert.equal(summary.balance, 0);

  // Earned Sparks are unaffected by the S5 field.
  await seedSparks(userId, { amount: 5, kind: "EARNED" });
  const after = await spark.getSparkUsageSummary(userId);
  assert.equal(after.balance, 5);
  assert.equal(after.earnedSparks, 5);
  assert.equal(after.subscriptionSparks, 0);
  assert.equal(after.subscriptionStatus, null);
  assert.equal(after.subscriptionPeriodEnd, null);
});

test("active paid subscription: summary exposes server-derived status and period end", { skip: SKIP }, async () => {
  const { spark, sub } = await services();
  const userId = await createUser("s5ui_paid");

  const activated = await sub.activateSubscription({
    userId,
    plan: "SPARK_PLUS",
  });

  const summary = await spark.getSparkUsageSummary(userId);
  assert.equal(summary.plan, "SPARK_PLUS");
  assert.equal(summary.subscriptionStatus, "ACTIVE");
  assert.equal(
    summary.subscriptionPeriodEnd,
    activated.subscription.currentPeriodEnd.toISOString(),
  );
  assert.equal(summary.subscriptionSparks, 100);
  assert.equal(summary.balance, 100);
  assert.equal(summary.extraUploadCost, 4);
  assert.equal(summary.captionEditCost, 1);
});

test("canceled subscription: benefits and status remain until the period end", { skip: SKIP }, async () => {
  const { spark, sub } = await services();
  const userId = await createUser("s5ui_cancel");

  const activated = await sub.activateSubscription({
    userId,
    plan: "SPARK_PLUS",
  });
  await sub.cancelSubscription(userId);

  const summary = await spark.getSparkUsageSummary(userId);
  // Cancellation is non-renewing, not immediate expiration.
  assert.equal(summary.subscriptionStatus, "CANCELED");
  assert.equal(summary.plan, "SPARK_PLUS");
  assert.equal(
    summary.subscriptionPeriodEnd,
    activated.subscription.currentPeriodEnd.toISOString(),
  );
  assert.equal(summary.subscriptionSparks, 100);
});

test("expired subscription: effective plan FREE, status EXPIRED, ledger untouched", { skip: SKIP }, async () => {
  const { spark, sub } = await services();
  const client = await db();
  const userId = await createUser("s5ui_expired");

  // A billing period that has already elapsed: period start 60 days ago →
  // period end (and grant expiresAt) 30 days ago — exactly how production
  // rows age, since the grant always expires with its period.
  const periodStart = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const activated = await sub.activateSubscription({
    userId,
    plan: "SPARK_PRO",
    periodStart,
  });
  assert.ok(activated.grant.granted, "grant row exists for the elapsed period");
  assert.ok(activated.subscription.currentPeriodEnd < new Date());

  const grantRows = await client.sparkTransaction.count({
    where: { userId, type: "SUBSCRIPTION_GRANT" },
  });
  assert.equal(grantRows, 1);

  // Before the status sweep: benefits already ended by time alone.
  const beforeSweep = await spark.getSparkUsageSummary(userId);
  assert.equal(beforeSweep.plan, "FREE");
  assert.equal(beforeSweep.subscriptionStatus, "EXPIRED");
  assert.equal(beforeSweep.subscriptionPeriodEnd, null);
  assert.equal(beforeSweep.subscriptionSparks, 0);
  assert.equal(beforeSweep.balance, 0);

  // After the bookkeeping sweep: same effective state, raw row flipped.
  await sub.expireDueSubscriptions();
  const row = await client.subscription.findUnique({
    where: { userId },
    select: { status: true },
  });
  assert.equal(row?.status, "EXPIRED");

  const afterSweep = await spark.getSparkUsageSummary(userId);
  assert.equal(afterSweep.plan, "FREE");
  assert.equal(afterSweep.subscriptionStatus, "EXPIRED");
  assert.equal(afterSweep.subscriptionPeriodEnd, null);
  assert.equal(afterSweep.subscriptionSparks, 0);
  assert.equal(afterSweep.balance, 0);

  // Expiration never mutates or deletes historical ledger rows.
  const remaining = await client.sparkTransaction.count({ where: { userId } });
  assert.equal(remaining, grantRows);
});
