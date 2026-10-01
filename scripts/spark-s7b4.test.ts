/**
 * S7-B.4 — Spark Plan purchase flow + payment status polling tests.
 *
 * Source-level tests pin the client contract (plan selection, purchase
 * creation, payment initialization, safe payment-URL handling, bounded
 * polling, browser-return neutrality, success refresh, UI parity). Unit
 * tests cover the pure client helpers. Live-DB tests cover server-derived
 * pricing, idempotent purchase creation, and payment initialization through
 * a stub PaymentProvider — no real credentials exist in tests, and nothing
 * in this file (or the client) can mark a payment SUCCEEDED.
 *
 * Run: npm run test:spark-s7b4
 */
import "./test-db-guard";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PrismaClient } from "@prisma/client";
import {
  PaymentProviderError,
  type CreatePaymentInput,
  type CreatePaymentResult,
  type PaymentProvider,
  type VerifiedPaymentResult,
} from "../lib/payment/payment-contract";

const root = resolve(import.meta.dirname, "..");
function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

const flow = read("components/sparks/SparkPlanPurchaseFlow.tsx");
const section = read("components/sparks/SparkPlanSection.tsx");
const statusClient = read("lib/purchase-status-client.ts");
const usePurchaseStatusSrc = read("hooks/usePurchaseStatus.ts");
const returnPage = read("app/subscription/checkout/return/page.tsx");
const profileClient = read("components/profile/ProfilePageClient.tsx");

/** Literal price digits that must never appear in client code (S7-B.4). */
const PRICE_DIGITS = /(?:29,?000|59,?000|99,?000)/;
/** Provider secret / signature material that must never appear in client code. */
const SECRETS = /merchantSecret|merchant_secret|hashValue|PAYMENT_MERCHANT|createHmac|HMAC/i;
const CLIENT_FILES: Array<[string, string]> = [
  ["SparkPlanPurchaseFlow", flow],
  ["SparkPlanSection", section],
  ["purchase-status-client", statusClient],
  ["usePurchaseStatus", usePurchaseStatusSrc],
  ["checkout/return page", returnPage],
];

// ===========================================================================
// Plan selection
// ===========================================================================

test("plan selection: paid plans send only the plan identifier; the server derives the price", () => {
  // The request body is exactly { plan } — no amount, no currency, no price.
  assert.match(flow, /body: JSON\.stringify\(\{ plan \}\)/);
  assert.doesNotMatch(flow, /body: JSON\.stringify\(\{[^}]*(amount|currency|price|order|signature)/i);
  // Plan information is read from the server-backed PLAN_CONFIG (S6 contract).
  assert.match(section, /from "@\/lib\/subscription-plans"/);
});

test("plan selection: FREE can never initiate a purchase", () => {
  assert.match(flow, /if \(plan === "FREE"\) return;/);
  // FREE cards render no purchase affordance at all.
  assert.match(flow, /if \(plan === "FREE"\) \{[\s\S]{0,200}return null;/);
});

test("plan selection: no client price constants anywhere in the S7-B.4 client", () => {
  for (const [name, src] of CLIENT_FILES) {
    assert.doesNotMatch(src, PRICE_DIGITS, `${name} must not contain price digits`);
  }
  // PLAN_CONFIG is not duplicated into the client.
  for (const [name, src] of CLIENT_FILES) {
    assert.doesNotMatch(src, /monthlyPriceMmk\s*:\s*\d/, `${name} must not define plan prices`);
    assert.doesNotMatch(src, /plan:\s*"(SPARK_PLUS|SPARK_PRO|SPARK_ULTRA)"/, `${name} must not hard-code plan→price data`);
  }
});

test("plan selection: displayed price comes from the server purchase record", () => {
  assert.match(flow, /purchase\.amountMmk/);
  assert.match(flow, /purchase\.currency/);
});

// ===========================================================================
// Purchase creation
// ===========================================================================

test("purchase creation: POST /api/subscription/purchases with Idempotency-Key and { plan } only", () => {
  assert.match(flow, /PURCHASES_ENDPOINT/);
  assert.match(flow, /"Idempotency-Key": idempotencyKey/);
  assert.match(flow, /body: JSON\.stringify\(\{ plan \}\)/);
});

test("purchase creation: double-click / re-render cannot double-submit", () => {
  const guardCount = (flow.match(/if \(inFlightRef\.current\) return;/g) ?? []).length;
  assert.ok(guardCount >= 2, "both start() and retry paths must be guarded by inFlightRef");
});

test("purchase creation: retry after network interruption reuses the same idempotency key", () => {
  assert.match(flow, /const previous = attemptRef\.current;/);
  assert.match(flow, /previous\.key/);
  assert.match(flow, /attemptRef\.current = \{ plan, key \}/);
});

test("purchase creation: idempotency keys are random, never user-derived or permanent", () => {
  assert.match(flow, /crypto\.randomUUID/);
  assert.doesNotMatch(flow, /Idempotency-Key":\s*(user|String\()/);
});

test("purchase creation: safe messages for auth / already-active / generic errors", () => {
  assert.match(flow, /You already have an active subscription/);
  assert.match(flow, /Something went wrong while starting your purchase\. Please try again\./);
  assert.match(flow, /We couldn't reach Snappy\. Please check your connection and try again\./);
  // No internal detail leaks.
  assert.doesNotMatch(flow, /Prisma|stack|Error\.stack|\.message \}/);
});

// ===========================================================================
// Payment initialization
// ===========================================================================

test("payment initialization: purchase id in the URL, Idempotency-Key header, no body", () => {
  assert.match(flow, /encodeURIComponent\(target\.id\)/);
  assert.match(flow, /\/payment`/);
  // The payment-init fetch block sends no request body at all.
  const payIdx = flow.indexOf("/payment`");
  assert.ok(payIdx > 0);
  const payBlock = flow.slice(payIdx, payIdx + 800);
  assert.doesNotMatch(payBlock, /body/);
});

test("payment initialization: no client money/provider fields are ever sent", () => {
  for (const [name, src] of CLIENT_FILES) {
    assert.doesNotMatch(src, SECRETS, `${name} must not contain provider secret material`);
    assert.doesNotMatch(
      src,
      /JSON\.stringify\(\{[^}]*(amount|currency|orderReferenceId|providerReferenceId|signature|callbackUrl)/i,
      `${name} must not serialize money/provider fields`,
    );
  }
});

test("payment initialization: payment URL is validated and opened safely, never rendered as HTML", () => {
  assert.match(flow, /toSafePaymentUrl\(data\.paymentUrl\)/);
  assert.match(flow, /openExternalLink\(safeUrl\)/);
  for (const [name, src] of CLIENT_FILES) {
    assert.doesNotMatch(src, /dangerouslySetInnerHTML|innerHTML/, `${name} must not inject HTML`);
  }
  // An unopenable URL degrades to status observation, not failure.
  assert.match(flow, /We couldn't open the payment window automatically/);
});

test("payment initialization: server errors map to safe, non-financial messages", () => {
  assert.match(flow, /response\.status === 409/);
  assert.match(flow, /We couldn't find that purchase\. Please try again\./);
  assert.match(flow, /Payments aren't available right now\. Please try again later\./);
});

// ===========================================================================
// Status polling (server-authoritative, bounded, single loop)
// ===========================================================================

test("polling: gentle cadence (2–4s) and a bounded window (5–10 min)", () => {
  assert.match(statusClient, /PURCHASE_POLL_INTERVAL_MS = 3_000/);
  assert.match(statusClient, /PURCHASE_POLL_WINDOW_MS = 8 \* 60 \* 1000/);
});

test("polling: terminal statuses stop the loop; PENDING and INITIALIZED continue", async () => {
  const client = await getStatusClient();
  assert.equal(client.isPollingTerminalStatus("SUCCEEDED"), true);
  assert.equal(client.isPollingTerminalStatus("FAILED"), true);
  assert.equal(client.isPollingTerminalStatus("CANCELED"), true);
  assert.equal(client.isPollingTerminalStatus("EXPIRED"), true);
  assert.equal(client.isPollingTerminalStatus("PENDING"), false);
  assert.equal(client.isPollingTerminalStatus("INITIALIZED"), false);
});

test("polling: exactly one loop per purchase — timer ref prevents stacking", () => {
  assert.match(usePurchaseStatusSrc, /if \(timerRef\.current !== null\) return;/);
  assert.match(usePurchaseStatusSrc, /clearTimeout\(timerRef\.current\)/);
});

test("polling: window expiry reports 'still processing', never a false failure", async () => {
  assert.match(usePurchaseStatusSrc, /setStillProcessing\(true\);/);
  // The expired-window state must not set the error state.
  const expiryBlock = usePurchaseStatusSrc.slice(
    usePurchaseStatusSrc.indexOf("Date.now() >= deadlineRef.current"),
  );
  const block = expiryBlock.slice(0, expiryBlock.indexOf("},"));
  assert.doesNotMatch(block, /setError\(/);
  // Neutral copy for in-flight payments.
  const pendingCopy = (await describeStatus("PENDING")) as string;
  assert.equal(pendingCopy, "Payment is still being processed.");
  assert.match(returnPage, /Payment is still being processed\. You can check your Spark balance later\./);
});

test("polling: pauses when hidden, resumes visible, aborts in-flight requests", () => {
  assert.match(usePurchaseStatusSrc, /document\.hidden/);
  assert.match(usePurchaseStatusSrc, /visibilitychange/);
  assert.match(usePurchaseStatusSrc, /AbortController/);
  assert.match(usePurchaseStatusSrc, /abortRef\.current\?\.abort\(\)/);
});

test("polling: unmount stops the loop and removes listeners", () => {
  assert.match(usePurchaseStatusSrc, /mountedRef\.current = false;/);
  assert.match(usePurchaseStatusSrc, /stopPolling\(\);/);
  assert.match(usePurchaseStatusSrc, /removeEventListener\("visibilitychange"/);
});

test("polling: only GET reads — the client cannot cause any status transition", () => {
  assert.match(statusClient, /fetchPurchaseStatus/);
  assert.doesNotMatch(statusClient, /method:\s*"(POST|PUT|PATCH|DELETE)"/);
  for (const [name, src] of CLIENT_FILES) {
    assert.doesNotMatch(src, /\bfulfill\w*|\bcallback\b|markPaid|confirmPayment/i, `${name} must not reference fulfillment`);
  }
});

// ===========================================================================
// Browser return (navigation context only — never success authority)
// ===========================================================================

test("browser return: URL query parameters are never read or trusted", () => {
  assert.doesNotMatch(returnPage, /useSearchParams|location\.search|searchParams/);
  assert.doesNotMatch(returnPage, /[?&]success=/);
  assert.doesNotMatch(returnPage, /URLSearchParams/);
});

test("browser return: re-fetches the server purchase status as the only truth", () => {
  assert.match(returnPage, /usePurchaseStatus|fetchPurchaseStatus/);
  assert.match(returnPage, /current !== "SUCCEEDED"/);
  assert.match(returnPage, /readActivePurchaseId/);
});

// ===========================================================================
// Success refresh (authoritative re-fetch only)
// ===========================================================================

test("success refresh: SUCCEEDED refreshes authoritative server state", () => {
  assert.match(flow, /window\.dispatchEvent\(new Event\(SPARK_USAGE_UPDATED_EVENT\)\)/);
  assert.match(flow, /router\.refresh\(\)/);
  assert.match(flow, /successFiredRef/);
  assert.match(returnPage, /window\.dispatchEvent\(new Event\(SPARK_USAGE_UPDATED_EVENT\)\)/);
});

test("success refresh: the client never locally increments Sparks or switches plans", () => {
  for (const [name, src] of CLIENT_FILES) {
    assert.doesNotMatch(src, /sparks?\s*[+]=|\+\s*100\b|balance\s*[+]=/i, `${name} must not mutate Spark counts`);
    assert.doesNotMatch(src, /plan:\s*"(SPARK_PLUS|SPARK_PRO|SPARK_ULTRA)"/, `${name} must not set a plan locally`);
  }
});

// ===========================================================================
// UI parity (Web / PWA / Telegram Mini App)
// ===========================================================================

test("UI parity: one shared SparkPlanSection drives all platforms", () => {
  assert.match(profileClient, /<SparkPlanSection/);
  assert.match(flow, /openExternalLink/); // Telegram-aware navigation with PWA fallback
  assert.match(section, /SparkPlanPurchaseAction/);
  assert.match(section, /SparkPlanPurchaseStatusPanel/);
});

// ===========================================================================
// Unit: pure client helpers
// ===========================================================================

type StatusClient = typeof import("../lib/purchase-status-client");
let statusClientMod: StatusClient | null = null;
async function getStatusClient(): Promise<StatusClient> {
  if (!statusClientMod) statusClientMod = await import("../lib/purchase-status-client");
  return statusClientMod;
}
async function describeStatus(status: Parameters<StatusClient["describePurchaseStatus"]>[0]) {
  return (await getStatusClient()).describePurchaseStatus(status);
}

test("unit: toSafePaymentUrl accepts only absolute http(s) URLs", async () => {
  const { toSafePaymentUrl } = await getStatusClient();
  assert.equal(toSafePaymentUrl("https://pay.example.com/checkout/1"), "https://pay.example.com/checkout/1");
  assert.ok(toSafePaymentUrl("http://localhost:3000/pay") !== null);
  assert.equal(toSafePaymentUrl("javascript:alert(1)"), null);
  assert.equal(toSafePaymentUrl("data:text/html;base64,PHNjcmlwdD4="), null);
  assert.equal(toSafePaymentUrl("vbscript:msgbox(1)"), null);
  assert.equal(toSafePaymentUrl("/subscription/checkout/return"), null);
  assert.equal(toSafePaymentUrl("//evil.example.com/x"), null);
  assert.equal(toSafePaymentUrl(""), null);
  assert.equal(toSafePaymentUrl(null), null);
  assert.equal(toSafePaymentUrl(undefined), null);
});

test("unit: describePurchaseStatus never lies about outcome", async () => {
  const pending = await describeStatus("PENDING");
  assert.equal(pending, "Payment is still being processed.");
  const initialized = await describeStatus("INITIALIZED");
  assert.ok(initialized.length > 0);
  assert.doesNotMatch(initialized, /fail/i);
  assert.doesNotMatch(initialized, /success/i);
  const failed = await describeStatus("FAILED");
  assert.doesNotMatch(failed, /payment (succeeded|confirmed|was successful)/i);
  const succeeded = await describeStatus("SUCCEEDED");
  assert.doesNotMatch(succeeded, /failed/i);
  assert.ok((await describeStatus("CANCELED")).length > 0);
  assert.ok((await describeStatus("EXPIRED")).length > 0);
});

// ===========================================================================
// Live DB: server-derived pricing + idempotent purchase creation
// ===========================================================================

const hasDb = Boolean(process.env.DATABASE_URL);
const SKIP = !hasDb ? "DATABASE_URL not set" : false;
let prisma: PrismaClient | null = null;
const userIds: string[] = [];

async function db(): Promise<PrismaClient> {
  if (!prisma) {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
  }
  return prisma;
}

type PurchaseService = typeof import("../lib/subscription-purchase-service");
let purchaseService: PurchaseService | null = null;
async function purchases(): Promise<PurchaseService> {
  if (!purchaseService) purchaseService = await import("../lib/subscription-purchase-service");
  return purchaseService;
}

type InitService = typeof import("../lib/payment-initialization-service");
let initService: InitService | null = null;
async function init(): Promise<InitService> {
  if (!initService) initService = await import("../lib/payment-initialization-service");
  return initService;
}

let keySeq = 0;
function testKey(label: string): string {
  return `s7b4-${label}-${++keySeq}-${Math.random().toString(36).slice(2, 10)}`;
}

async function makeUser(label: string) {
  const client = await db();
  const user = await client.user.create({
    data: {
      name: `s7b4_${label}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      profileImage: "https://example.com/s7b4.jpg",
    },
  });
  userIds.push(user.id);
  return user;
}

after(async () => {
  if (!prisma) return;
  for (const id of userIds) {
    await prisma.sparkTransaction.deleteMany({ where: { userId: id } });
    await prisma.subscriptionPurchase.deleteMany({ where: { userId: id } });
    await prisma.subscription.deleteMany({ where: { userId: id } });
    await prisma.user.deleteMany({ where: { id } });
  }
  await prisma.$disconnect();
});

test("live: purchase price is derived from server PLAN_CONFIG for every paid plan", { skip: SKIP }, async () => {
  const { createPurchase } = await purchases();
  const { PLAN_CONFIG } = await import("../lib/subscription-plans");
  const plans = ["SPARK_PLUS", "SPARK_PRO", "SPARK_ULTRA"] as const;
  for (const plan of plans) {
    const user = await makeUser("price");
    const purchase = await createPurchase(user.id, plan, testKey("price"));
    assert.equal(purchase.requestedPlan, plan);
    assert.equal(purchase.amountMmk, PLAN_CONFIG[plan].monthlyPriceMmk, `${plan} amount from PLAN_CONFIG`);
    assert.equal(purchase.currency, "MMK");
    assert.equal(purchase.status, "INITIALIZED");
  }
});

test("live: same idempotency key replays the same purchase (double-tap safe)", { skip: SKIP }, async () => {
  const { createPurchase } = await purchases();
  const user = await makeUser("replay");
  const key = testKey("replay");
  const first = await createPurchase(user.id, "SPARK_PLUS", key);
  const second = await createPurchase(user.id, "SPARK_PLUS", key);
  assert.equal(second.id, first.id);
  const rows = await (await db()).subscriptionPurchase.count({ where: { userId: user.id } });
  assert.equal(rows, 1, "exactly one purchase row for a repeated tap");
});

test("live: reusing a key for a different plan is rejected (idempotency_conflict)", { skip: SKIP }, async () => {
  const { createPurchase, SubscriptionPurchaseServiceError } = await purchases();
  const user = await makeUser("conflict");
  const key = testKey("conflict");
  await createPurchase(user.id, "SPARK_PLUS", key);
  await assert.rejects(
    () => createPurchase(user.id, "SPARK_PRO", key),
    (e: unknown) => e instanceof SubscriptionPurchaseServiceError && e.code === "idempotency_conflict",
  );
});

test("live: FREE is never purchasable (invalid_plan)", { skip: SKIP }, async () => {
  const { createPurchase, SubscriptionPurchaseServiceError } = await purchases();
  const user = await makeUser("free");
  await assert.rejects(
    () => createPurchase(user.id, "FREE", testKey("free")),
    (e: unknown) => e instanceof SubscriptionPurchaseServiceError && e.code === "invalid_plan",
  );
});

test("live: an active subscription blocks new purchases (subscription_already_active)", { skip: SKIP }, async () => {
  const { createPurchase, SubscriptionPurchaseServiceError } = await purchases();
  const user = await makeUser("active");
  const now = Date.now();
  await (await db()).subscription.create({
    data: {
      userId: user.id,
      plan: "SPARK_PLUS",
      status: "ACTIVE",
      currentPeriodStart: new Date(now - 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(now + 30 * 24 * 60 * 60 * 1000),
    },
  });
  await assert.rejects(
    () => createPurchase(user.id, "SPARK_PRO", testKey("active")),
    (e: unknown) => e instanceof SubscriptionPurchaseServiceError && e.code === "subscription_already_active",
  );
});

// ===========================================================================
// Live DB: payment initialization via a stub PaymentProvider
// ===========================================================================

interface StubCall {
  input: CreatePaymentInput;
}

// providerReferenceId is globally unique in the schema — one sequence for
// the whole run so separate tests can never collide.
let stubRefSeq = 0;

function stubProvider(
  options: {
    paymentUrl?: string | null;
    failWith?: () => Error;
  } = {},
): PaymentProvider & { calls: StubCall[]; results: CreatePaymentResult[] } {
  const calls: StubCall[] = [];
  const results: CreatePaymentResult[] = [];
  return {
    providerId: "s7b4-stub",
    calls,
    results,
    async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
      if (options.failWith) throw options.failWith();
      calls.push({ input });
      const result: CreatePaymentResult = {
        providerReferenceId: `s7b4-stub-ref-${++stubRefSeq}`,
        paymentUrl: options.paymentUrl === undefined ? "https://pay.example.com/s7b4-checkout" : options.paymentUrl,
        providerStatus: "PENDING",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      };
      results.push(result);
      return result;
    },
    async verifyCallback(): Promise<VerifiedPaymentResult> {
      throw new Error("verifyCallback is never used in S7-B.4 tests");
    },
  };
}

const URLS = {
  backendCallbackUrl: "https://snappy.example.com/api/payments/wave/callback",
  frontendReturnUrl: "https://snappy.example.com/subscription/checkout/return",
};

test("live: payment initialization passes the purchase id and only server-derived money fields", { skip: SKIP }, async () => {
  const { createPurchase } = await purchases();
  const { initializePurchasePayment } = await init();
  const { PLAN_CONFIG } = await import("../lib/subscription-plans");
  const user = await makeUser("init");
  const purchase = await createPurchase(user.id, "SPARK_PLUS", testKey("init"));
  const stub = stubProvider();

  const result = await initializePurchasePayment(user.id, purchase.id, testKey("init-pay"), stub, URLS);

  assert.equal(result.purchaseId, purchase.id);
  assert.equal(result.status, "PENDING");
  assert.equal(result.paymentUrl, "https://pay.example.com/s7b4-checkout");
  assert.ok(result.expiresAt);

  assert.equal(stub.calls.length, 1);
  const input = stub.calls[0].input;
  assert.equal(input.purchaseId, purchase.id);
  assert.equal(input.amountMmk, PLAN_CONFIG.SPARK_PLUS.monthlyPriceMmk, "amount comes from the persisted purchase row");
  assert.equal(input.currency, "MMK");
  assert.match(input.orderReferenceId, /^subpurchase_/);
  assert.equal(input.backendCallbackUrl, URLS.backendCallbackUrl);
  assert.equal(input.frontendReturnUrl, URLS.frontendReturnUrl);

  const stored = await (await db()).subscriptionPurchase.findUnique({ where: { id: purchase.id } });
  assert.equal(stored?.status, "PENDING");
  assert.equal(stored?.providerReferenceId, stub.results[0].providerReferenceId);
});

test("live: PENDING replay returns paymentUrl null and never re-hits the provider", { skip: SKIP }, async () => {
  const { createPurchase } = await purchases();
  const { initializePurchasePayment } = await init();
  const user = await makeUser("replay-init");
  const purchase = await createPurchase(user.id, "SPARK_PLUS", testKey("replay-init"));
  const stub = stubProvider();
  await initializePurchasePayment(user.id, purchase.id, testKey("r1"), stub, URLS);

  const replay = await initializePurchasePayment(user.id, purchase.id, testKey("r2"), stub, URLS);
  assert.equal(replay.status, "PENDING");
  assert.equal(replay.paymentUrl, null);
  assert.equal(stub.calls.length, 1, "provider createPayment called exactly once");
});

test("live: provider failure fails closed — purchase stays INITIALIZED", { skip: SKIP }, async () => {
  const { createPurchase } = await purchases();
  const { initializePurchasePayment, PaymentInitializationError } = await init();
  const user = await makeUser("fail");
  const purchase = await createPurchase(user.id, "SPARK_PLUS", testKey("fail"));
  const stub = stubProvider({
    failWith: () => new PaymentProviderError("transport_error", "simulated outage"),
  });

  await assert.rejects(
    () => initializePurchasePayment(user.id, purchase.id, testKey("fail-pay"), stub, URLS),
    (e: unknown) => e instanceof PaymentInitializationError && e.code === "payment_provider_error",
  );
  const stored = await (await db()).subscriptionPurchase.findUnique({ where: { id: purchase.id } });
  assert.equal(stored?.status, "INITIALIZED", "no transition is persisted on provider failure");
  assert.equal(stored?.providerReferenceId, null);
});

test("live: duplicate provider request maps to payment_already_requested", { skip: SKIP }, async () => {
  const { createPurchase } = await purchases();
  const { initializePurchasePayment, PaymentInitializationError } = await init();
  const user = await makeUser("dup");
  const purchase = await createPurchase(user.id, "SPARK_PLUS", testKey("dup"));
  const stub = stubProvider({
    failWith: () => new PaymentProviderError("duplicate_request", "already requested"),
  });

  await assert.rejects(
    () => initializePurchasePayment(user.id, purchase.id, testKey("dup-pay"), stub, URLS),
    (e: unknown) => e instanceof PaymentInitializationError && e.code === "payment_already_requested",
  );
});

test("live: terminal purchases are never reopened (purchase_not_eligible)", { skip: SKIP }, async () => {
  const { initializePurchasePayment, PaymentInitializationError } = await init();
  const { PLAN_CONFIG } = await import("../lib/subscription-plans");
  const user = await makeUser("terminal");
  const row = await (await db()).subscriptionPurchase.create({
    data: {
      userId: user.id,
      requestedPlan: "SPARK_PLUS",
      amountMmk: PLAN_CONFIG.SPARK_PLUS.monthlyPriceMmk,
      planConfigVersion: "1",
      currency: "MMK",
      orderReferenceId: `subpurchase_s7b4_${user.id.slice(-14)}`,
      idempotencyKeyHash: `hash_${user.id.slice(-14)}`,
      status: "SUCCEEDED",
    },
  });
  const stub = stubProvider();
  await assert.rejects(
    () => initializePurchasePayment(user.id, row.id, testKey("term"), stub, URLS),
    (e: unknown) => e instanceof PaymentInitializationError && e.code === "purchase_not_eligible",
  );
  assert.equal(stub.calls.length, 0, "the provider is never contacted for a terminal purchase");
});

test("live: cross-user initialization is indistinguishable from a missing purchase", { skip: SKIP }, async () => {
  const { createPurchase } = await purchases();
  const { initializePurchasePayment, PaymentInitializationError } = await init();
  const owner = await makeUser("owner");
  const stranger = await makeUser("stranger");
  const purchase = await createPurchase(owner.id, "SPARK_PLUS", testKey("owner"));
  const stub = stubProvider();

  await assert.rejects(
    () => initializePurchasePayment(stranger.id, purchase.id, testKey("stranger"), stub, URLS),
    (e: unknown) => e instanceof PaymentInitializationError && e.code === "purchase_not_found",
  );
  assert.equal(stub.calls.length, 0);
});

test("live: owner-scoped status read exposes only safe fields", { skip: SKIP }, async () => {
  const { createPurchase, getPurchase } = await purchases();
  const user = await makeUser("safe-read");
  const purchase = await createPurchase(user.id, "SPARK_PRO", testKey("safe-read"));
  const safe = await getPurchase(user.id, purchase.id);
  assert.ok(safe);
  const record = safe as unknown as Record<string, unknown>;
  assert.equal(record.id, purchase.id);
  assert.equal(record.requestedPlan, "SPARK_PRO");
  assert.ok(!("idempotencyKeyHash" in record), "idempotency hash is never exposed");
  assert.ok(!("providerReferenceId" in record), "provider reference is never exposed");
  assert.ok(!("orderReferenceId" in record) || typeof record.orderReferenceId === "string");
});
