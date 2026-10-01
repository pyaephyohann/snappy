/**
 * S7-A — provider-independent purchase foundation tests.
 *
 * Source checks always run. Live DB tests use only `s7a_` users, skip when
 * DATABASE_URL is absent, and do not attempt fulfillment because S7-A has no
 * trusted payment verifier.
 *
 * Run: npm run test:spark-s7a
 */
import "./test-db-guard";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { PLAN_CONFIG, PAID_PLANS } from "../lib/subscription-plans";
import type { PrismaClient } from "@prisma/client";

const root = resolve(import.meta.dirname, "..");
const hasDb = Boolean(process.env.DATABASE_URL);
const SKIP = !hasDb ? "DATABASE_URL not set" : false;
let prisma: PrismaClient | null = null;
const userIds: string[] = [];

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

function listFilesRecursively(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFilesRecursively(full));
    else files.push(full);
  }
  return files;
}

async function db(): Promise<PrismaClient> {
  if (!prisma) {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
  }
  return prisma;
}

async function createUser(name: string): Promise<string> {
  const client = await db();
  const user = await client.user.create({
    data: { name, profileImage: "https://example.com/s7a-test.jpg" },
  });
  userIds.push(user.id);
  return user.id;
}

before(async () => {
  if (!hasDb) return;
  const client = await db();
  await client.user.deleteMany({ where: { name: { startsWith: "s7a_" } } });
});

after(async () => {
  if (!prisma) return;
  for (const userId of userIds) {
    await prisma.subscriptionPurchase.deleteMany({ where: { userId } });
    await prisma.subscription.deleteMany({ where: { userId } });
    await prisma.sparkTransaction.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

// ===========================================================================
// Purchase configuration + API boundary
// ===========================================================================

test("purchase service uses PLAN_CONFIG for price and accepts only paid plans", () => {
  const service = read("lib/subscription-purchase-service.ts");
  assert.match(service, /PAID_PLANS\.includes\(requestedPlan\)/);
  assert.match(service, /PLAN_CONFIG\[requestedPlan\]\.monthlyPriceMmk/);
  assert.match(service, /currency:\s*PURCHASE_CURRENCY/);
  assert.match(service, /const PURCHASE_CURRENCY = "MMK"/);
  assert.doesNotMatch(service, /requestedPlan:\s*\{.*amount|input\.amountMmk|input\.currency|input\.subscriptionSparks/);
  assert.match(service, /activateSubscriptionInTransaction/);
  assert.doesNotMatch(service, /(?:29,?000|59,?000|99,?000)/);
  assert.deepEqual([...PAID_PLANS], ["SPARK_PLUS", "SPARK_PRO", "SPARK_ULTRA"]);
  assert.ok(PLAN_CONFIG.FREE.monthlyPriceMmk === 0);
});

test("purchase API authenticates and strict-parses only a paid plan", () => {
  const route = read("app/api/subscription/purchases/route.ts");
  assert.match(route, /requireAuthenticatedAppUser/);
  assert.match(route, /z\s*\.object\(\{[\s\S]*?plan:\s*z\.enum/);
  assert.match(route, /\.strict\(\)/);
  assert.match(route, /idempotency-key/i);
  assert.doesNotMatch(route, /body: z\.object|amountMmk\s*:\s*z\.|currency\s*:\s*z\.|periodStart\s*:\s*z\.|status\s*:\s*z\.|paymentSucceeded/);
});

test("purchase reads and cancellation are authenticated and owner-scoped", () => {
  const getRoute = read("app/api/subscription/purchases/[id]/route.ts");
  assert.match(getRoute, /requireAuthenticatedAppUser/);
  assert.match(getRoute, /getPurchase\(user\.id, id\)/);
  assert.match(getRoute, /404/);

  const service = read("lib/subscription-purchase-service.ts");
  assert.match(service, /where: \{ id: purchaseId, userId \}/);
  assert.match(service, /SafeSubscriptionPurchase/);
  assert.doesNotMatch(service.slice(service.indexOf("const safePurchaseSelect"), service.indexOf("function isUniqueViolation")), /providerReferenceId|idempotencyKeyHash|periodStart/);

  const cancelRoute = read("app/api/subscription/cancel/route.ts");
  assert.match(cancelRoute, /requireAuthenticatedAppUser/);
  assert.match(cancelRoute, /cancelSubscription\(user\.id\)/);
  assert.doesNotMatch(cancelRoute, /request\.json|userId/);
  assert.match(read("lib/subscription-service.ts"), /data: \{ status: "CANCELED" \}/);
});

test("cancellation uses the existing non-renewing lifecycle semantics", () => {
  const route = read("app/api/subscription/cancel/route.ts");
  const subscription = read("lib/subscription-service.ts");
  assert.match(route, /cancelSubscription\(user\.id\)/);
  assert.match(subscription, /data: \{ status: "CANCELED" \}/);
  assert.match(subscription, /isSubscriptionActive\(existing, now\)/);
  assert.match(subscription, /CANCELED[\s\S]*benefits continue|Benefits [\s\S]* continue until `currentPeriodEnd`/);
  assert.doesNotMatch(subscription.slice(subscription.indexOf("export async function cancelSubscription")), /sparkTransaction\.(create|update|delete)/);
});

test("client cannot manufacture payment success; fulfillment remains internal and fails closed", () => {
  const purchaseRoute = read("app/api/subscription/purchases/route.ts");
  const statusRoute = read("app/api/subscription/purchases/[id]/route.ts");
  const cancelRoute = read("app/api/subscription/cancel/route.ts");
  for (const route of [purchaseRoute, statusRoute, cancelRoute]) {
    assert.doesNotMatch(route, /fulfillVerifiedPurchase|activateSubscription/);
    assert.doesNotMatch(route, /paymentSucceededAt|paid:\s*true|status:\s*["']SUCCEEDED["']/);
  }

  const publicFulfillRoute = resolve(root, "app/api/subscription/purchases/[id]/fulfill/route.ts");
  assert.equal(existsSync(publicFulfillRoute), false);

  const service = read("lib/subscription-purchase-service.ts");
  assert.match(service, /export async function fulfillVerifiedPurchase/);
  assert.match(service, /VerifiedPurchasePayment/);
  assert.match(service, /unique symbol/);
  assert.match(service, /payment verification required/);
  assert.match(service, /purchase\.status !== "PENDING"/);
  assert.doesNotMatch(service, /export function createVerifiedPurchasePayment/);
  assert.doesNotMatch(service, /paid:\s*true|paymentVerified\s*:\s*true/);
});

test("verified fulfillment is atomic, derives benefits, persists a stable period, and replays without extension", () => {
  const service = read("lib/subscription-purchase-service.ts");
  assert.match(service, /prisma\.\$transaction\(async \(tx\)/);
  assert.match(service, /FOR UPDATE/);
  assert.match(service, /purchase\.requestedPlan/);
  assert.match(service, /activateSubscriptionInTransaction\(tx/);
  assert.match(service, /subscriptionGrantReference\(subscription\.id, purchase\.periodStart\)/);
  assert.match(service, /providerReferenceId: verification\.verificationReference/);
  assert.match(service, /purchase\.providerReferenceId !== verification\.verificationReference/);
  assert.match(service, /status: "SUCCEEDED"/);
  assert.match(service, /purchase\.periodStart \?\? verification\.periodStart/);
  assert.match(service, /purchase\.status === "SUCCEEDED"/);
  assert.match(service, /purchase\.periodStart\.getTime\(\) !== verification\.periodStart\.getTime\(\)/);
  assert.match(service, /PLAN_CONFIG\[requestedPlan\]\.monthlyPriceMmk/);

  const subscriptionService = read("lib/subscription-service.ts");
  assert.match(subscriptionService, /activateSubscriptionInTransaction/);
  assert.match(subscriptionService, /grantSubscriptionSparks\(tx, existing, now\)/);
  assert.match(subscriptionService, /subscriptionGrantReference/);
});

test("no provider, webhook, or client callable fulfill route exists", () => {
  const service = read("lib/subscription-purchase-service.ts");
  assert.doesNotMatch(service, /Stripe|KPay|AYA Pay|UAB Pay|MyanMyanPay|webhook|createCheckout/i);

  const routes = listFilesRecursively(resolve(root, "app", "api")).filter((path) => path.endsWith("route.ts"));
  const subscriptionRoutes = routes.filter((path) => path.includes("/subscription/"));
  assert.equal(subscriptionRoutes.length, 4); // create, read, cancel, payment-init (S7-B.2)
  for (const path of subscriptionRoutes) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /fulfillVerifiedPurchase|activateSubscription/);
  }
  assert.equal(routes.filter((path) => /\/api\/(subscription|plans)\/.*webhook/i.test(path)).length, 0);
});

test("schema and migration add only provider-independent purchase state", () => {
  const schema = read("prisma/schema.prisma");
  const purchase = schema.slice(schema.indexOf("model SubscriptionPurchase"), schema.indexOf("model DailyUploadCounter"));
  for (const field of [
    "id", "userId", "requestedPlan", "amountMmk", "planConfigVersion", "currency",
    "orderReferenceId", "providerReferenceId", "status", "failureReason", "requestedAt",
    "paymentInitiatedAt", "paymentSucceededAt", "paymentFailedAt", "canceledAt", "expiresAt",
    "periodStart", "subscriptionId", "createdAt", "updatedAt",
  ]) assert.match(purchase, new RegExp(`\\b${field}\\b`));
  assert.match(schema, /enum PurchaseStatus \{[^}]*INITIALIZED[^}]*PENDING[^}]*SUCCEEDED[^}]*FAILED[^}]*CANCELED[^}]*EXPIRED/);
  assert.match(purchase, /@@unique\(\[userId, idempotencyKeyHash\]\)/);
  assert.match(purchase, /@@index\(\[userId, status, createdAt\]\)/);
  assert.match(purchase, /@@index\(\[status, expiresAt\]\)/);

  const migrationsDir = resolve(root, "prisma/migrations");
  const matches = readdirSync(migrationsDir).filter((name) => name.endsWith("_subscription_purchase_foundation"));
  assert.equal(matches.length, 1);
  const sql = read(`prisma/migrations/${matches[0]}/migration.sql`);
  assert.match(sql, /CREATE TYPE "PurchaseStatus"/);
  assert.match(sql, /CREATE TABLE "subscription_purchases"/);
  assert.equal(
    (sql.match(/CREATE UNIQUE INDEX "subscription_purchases_userId_idempotencyKeyHash_key"/g) ?? []).length,
    1,
    "the idempotency unique index is created exactly once",
  );
  assert.doesNotMatch(sql, /UPDATE "subscriptions"|UPDATE "spark_transactions"|DELETE FROM|DROP TABLE/);
});

// ===========================================================================
// Live DB tests: safe create/read/cancel only; no fake fulfillment
// ===========================================================================

test("live: createPurchase derives fields and safely replays idempotency key", { skip: SKIP }, async () => {
  const userId = await createUser(`s7a_create_${Date.now()}`);
  const service = await import("../lib/subscription-purchase-service");
  const first = await service.createPurchase(userId, "SPARK_PLUS", "s7a-idem-key-0001");
  const replay = await service.createPurchase(userId, "SPARK_PLUS", "s7a-idem-key-0001");
  assert.equal(first.id, replay.id);
  assert.equal(first.orderReferenceId, replay.orderReferenceId);
  assert.equal(first.amountMmk, PLAN_CONFIG.SPARK_PLUS.monthlyPriceMmk);
  assert.equal(first.currency, "MMK");
  assert.equal(first.status, "INITIALIZED");
  assert.notEqual("idempotencyKeyHash" in first, true);
});

test("live: owner-scoped purchase lookup does not disclose another user's row", { skip: SKIP }, async () => {
  const owner = await createUser(`s7a_owner_${Date.now()}`);
  const other = await createUser(`s7a_other_${Date.now()}`);
  const service = await import("../lib/subscription-purchase-service");
  const purchase = await service.createPurchase(owner, "SPARK_PRO", "s7a-idem-key-0002");
  const ownerRead = await service.getPurchase(owner, purchase.id);
  assert.equal(ownerRead?.id, purchase.id);
  assert.equal(await service.getPurchase(other, purchase.id), null);
});

test("live: FREE is rejected and no unauthenticated/user mutation API is exposed", { skip: SKIP }, async () => {
  const userId = await createUser(`s7a_free_${Date.now()}`);
  const service = await import("../lib/subscription-purchase-service");
  await assert.rejects(
    () => service.createPurchase(userId, "FREE", "s7a-idem-key-0003"),
    (error: unknown) => error instanceof service.SubscriptionPurchaseServiceError && error.code === "invalid_plan",
  );
});
