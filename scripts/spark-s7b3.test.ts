/**
 * S7-B.3 — Wave callback verification + guarded fulfillment tests.
 *
 * Unit tests run without a database (signed callback fixtures). Live-DB
 * tests cover purchase identification, state transitions, fulfillment
 * idempotency, and concurrency, and are skipped when DATABASE_URL is
 * absent. No real credentials exist in tests.
 *
 * Run: npm run test:spark-s7b3
 */
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHmac } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { createWavePaymentProvider } from "../lib/payment/wave-payment-provider";
import { resolveWaveProviderConfig } from "../lib/payment/payment-config";
import type { HttpTransport } from "../lib/payment/http-transport";
import { PaymentProviderError } from "../lib/payment/payment-contract";
import { waveCallbackHashMessage } from "../lib/payment/wave-signature";

const root = resolve(import.meta.dirname, "..");
function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

const SECRET = "s7b3-test-secret-key";
const MERCHANT_ID = "testmerchantID";
const API_BASE = "https://testpayments.wavemoney.io:8107";

// ---------------------------------------------------------------------------
// Signed callback fixtures (exact documented field order + null rule)
// ---------------------------------------------------------------------------

const BASE_CALLBACK_FIELDS: Record<string, unknown> = {
  status: "PAYMENT_CONFIRMED",
  merchantId: MERCHANT_ID,
  orderId: "subpurchase_abc123",
  merchantReferenceId: "purchase-xyz",
  frontendResultUrl: "https://snappy.example.com/subscription/checkout/return",
  backendResultUrl: "https://snappy.example.com/api/payments/wave/callback",
  initiatorMsisdn: "9791009039",
  amount: 29000,
  timeToLiveSeconds: 600,
  currency: "MMK",
  transactionId: "360",
  paymentRequestId: "pRequestId-1",
  requestTime: "2026-09-28T10:00:00",
};

function signedCallback(overrides: Record<string, unknown> = {}, signSecret = SECRET): string {
  const fields = { ...BASE_CALLBACK_FIELDS, ...overrides };
  const message = waveCallbackHashMessage({
    status: fields.status as string,
    timeToLiveSeconds: fields.timeToLiveSeconds as number,
    merchantId: fields.merchantId as string,
    orderId: (fields.orderId ?? null) as string | null,
    amount: fields.amount as number,
    backendResultUrl: fields.backendResultUrl as string,
    merchantReferenceId: fields.merchantReferenceId as string,
    initiatorMsisdn: fields.initiatorMsisdn as string,
    transactionId: fields.transactionId as string,
    paymentRequestId: fields.paymentRequestId as string,
    requestTime: fields.requestTime as string,
  });
  fields.hashValue = createHmac("sha256", signSecret).update(message, "utf8").digest("hex");
  return JSON.stringify(fields);
}

/** Tamper WITHOUT re-signing: signature no longer covers the payload. */
function tamperedCallback(overrides: Record<string, unknown>): string {
  const parsed = JSON.parse(signedCallback()) as Record<string, unknown>;
  return JSON.stringify({ ...parsed, ...overrides });
}

const noopTransport: HttpTransport = { async postForm() { throw new Error("no network in callback tests"); } };
const config = resolveWaveProviderConfig({
  PAYMENT_PROVIDER: "wavepay",
  PAYMENT_ENVIRONMENT: "test",
  PAYMENT_MERCHANT_ID: MERCHANT_ID,
  PAYMENT_MERCHANT_NAME: "Test Merchant",
  PAYMENT_MERCHANT_SECRET: SECRET,
  PAYMENT_API_BASE_URL: API_BASE,
});
const provider = createWavePaymentProvider({
  config,
  transport: noopTransport,
  now: () => new Date("2026-09-28T10:00:00.000Z"),
});

async function verify(raw: string) {
  return provider.verifyCallback({ rawBody: raw });
}

// ===========================================================================
// Signature verification (via the adapter — the only path to trust)
// ===========================================================================

test("signature: valid documented-format callback verifies and normalizes", async () => {
  const result = await verify(signedCallback());
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(result.providerReferenceId, "pRequestId-1");
  assert.equal(result.orderReferenceId, "subpurchase_abc123");
  assert.equal(result.merchantReferenceId, "purchase-xyz");
  assert.equal(result.amountMmk, 29000);
  assert.equal(result.currency, "MMK");
  assert.equal(result.providerEventId, "360");
});

test("signature: modified payload is rejected (amount/status/orderId tampering)", async () => {
  for (const overrides of [{ amount: 1 }, { status: "BILL_COLLECTION_FAILED" }, { orderId: "other-order" }]) {
    await assert.rejects(
      () => verify(tamperedCallback(overrides)),
      (e: unknown) => e instanceof PaymentProviderError && e.code === "invalid_signature",
    );
  }
});

test("signature: modified signature is rejected", async () => {
  const parsed = JSON.parse(signedCallback()) as Record<string, unknown>;
  const sig = parsed.hashValue as string;
  parsed.hashValue = (sig[0] === "a" ? "b" : "a") + sig.slice(1);
  await assert.rejects(
    () => verify(JSON.stringify(parsed)),
    (e: unknown) => e instanceof PaymentProviderError && e.code === "invalid_signature",
  );
  // Wrong-secret signature (structurally valid, from a forged merchant).
  await assert.rejects(
    () => verify(signedCallback({}, "attacker-secret")),
    (e: unknown) => e instanceof PaymentProviderError && e.code === "invalid_signature",
  );
});

test("signature: malformed and missing signatures are rejected without throwing", async () => {
  // Empty/non-string signatures are rejected as malformed by the strict
  // field check BEFORE any hash math; wrong-length/non-hex strings are
  // rejected by the constant-time verifier as invalid signatures.
  await assert.rejects(
    () => verify(tamperedCallback({ hashValue: "" })),
    (e: unknown) => e instanceof PaymentProviderError && e.code === "malformed_callback",
  );
  for (const badSig of ["zz", "abc", "G".repeat(64), "a".repeat(63)]) {
    await assert.rejects(
      () => verify(tamperedCallback({ hashValue: badSig })),
      (e: unknown) => e instanceof PaymentProviderError && e.code === "invalid_signature",
      `malformed signature ${JSON.stringify(badSig)} must be rejected`,
    );
  }
  const parsed = JSON.parse(signedCallback()) as Record<string, unknown>;
  delete parsed.hashValue;
  await assert.rejects(
    () => verify(JSON.stringify(parsed)),
    (e: unknown) => e instanceof PaymentProviderError && e.code === "malformed_callback",
  );
});

test("signature: HMAC-SHA256 constant-time path is retained in source", () => {
  const signatureSource = read("lib/payment/wave-signature.ts");
  assert.match(signatureSource, /timingSafeEqual/);
  assert.match(signatureSource, /createHmac\("sha256"/);
});

test("identity: merchant mismatch and foreign merchant callbacks fail closed", async () => {
  await assert.rejects(
    () => verify(signedCallback({ merchantId: "othermerchant" })),
    (e: unknown) => {
      const err = e as { code?: string };
      return e instanceof PaymentProviderError && (err.code === "merchant_mismatch" || err.code === "invalid_signature");
    },
  );
});

test("status: unknown provider status fails closed (never normalized)", async () => {
  await assert.rejects(
    () => verify(signedCallback({ status: "SOMETHING_NEW_WAVE_INVENTED" })),
    (e: unknown) => e instanceof PaymentProviderError && e.code === "unknown_status",
  );
});

// ===========================================================================
// Route-level source checks
// ===========================================================================

test("route: POST-only, bounded body, content-type gate, detail-free errors", () => {
  const route = read("app/api/payments/wave/callback/route.ts");
  assert.match(route, /export async function POST/);
  assert.match(route, /405/);
  assert.match(route, /MAX_CALLBACK_BODY_BYTES/);
  assert.match(route, /413/);
  assert.match(route, /415/);
  assert.match(route, /application\/json/);
  assert.match(route, /getPaymentProvider\(\)/);
  // No raw payload/signature logging and no subscription/Spark details out.
  assert.doesNotMatch(route, /console\.(log|info|debug)/);
  assert.doesNotMatch(route, /rawBody\)|console\.error\([^\n]*rawBody/);
  assert.match(route, /503/);
  // No browser-session auth and no client-callable fulfillment.
  assert.doesNotMatch(route, /requireAuthenticatedAppUser|fulfillVerifiedPurchase|mintVerifiedPurchasePayment/);
});

test("boundary: fulfillment capability is module-branded and unreachable from requests", () => {
  const service = read("lib/subscription-purchase-service.ts");
  // The S7-A brand and transactional fulfiller are intact.
  assert.match(service, /const verificationBrand: unique symbol = Symbol\("verified-subscription-payment"\)/);
  assert.match(service, /export async function fulfillVerifiedPurchase/);
  assert.match(service, /if \(verification\[verificationBrand\] !== true\)/);
  // The minter re-asserts the binding before minting.
  assert.match(service, /export function mintVerifiedPurchasePayment/);
  assert.match(service, /verified\.orderReferenceId !== purchase\.orderReferenceId/);
  assert.match(service, /verified\.amountMmk !== purchase\.amountMmk/);
  assert.match(service, /verified\.currency !== purchase\.currency/);
  // Brand symbol is NOT exported.
  assert.doesNotMatch(service, /export (const|let|var) verificationBrand/);
  // No route ever calls the minter; only the internal service does.
  const routes: string[] = [];
  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "route.ts") routes.push(full);
    }
  }
  walk(resolve(root, "app", "api"));
  for (const path of routes) {
    assert.doesNotMatch(
      readFileSync(path, "utf8"),
      /mintVerifiedPurchasePayment|fulfillVerifiedPurchase|verificationBrand/,
      `${path} must not touch the fulfillment capability`,
    );
  }
  // The callback service is the only caller, and it validates references,
  // amount, and currency BEFORE minting.
  const callbackService = read("lib/payment-callback-service.ts");
  assert.match(callbackService, /mintVerifiedPurchasePayment\(/);
  assert.match(callbackService, /verified\.amountMmk !== purchase\.amountMmk/);
  assert.match(callbackService, /verified\.currency !== purchase\.currency/);
  assert.match(callbackService, /orderReferenceId: verified\.orderReferenceId/);
  assert.match(callbackService, /providerReferenceId: verified\.providerReferenceId/);
});

test("orphan + state safety: service never fulfills without a persisted provider reference", () => {
  const callbackService = read("lib/payment-callback-service.ts");
  // Identification requires BOTH references to match one persisted row.
  assert.match(callbackService, /orderReferenceId: verified\.orderReferenceId/);
  assert.match(callbackService, /providerReferenceId: verified\.providerReferenceId/);
  assert.match(callbackService, /purchase_not_found/);
  // State machine only permits PENDING → SUCCEEDED (verified success).
  const state = read("lib/payment/payment-state.ts");
  assert.doesNotMatch(state, /current === "INITIALIZED"[\s\S]{0,200}return transition\(current, "SUCCEEDED"/);
});

// ===========================================================================
// Live DB: identification, state, fulfillment idempotency, concurrency
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

type CallbackService = typeof import("../lib/payment-callback-service");
let cbService: CallbackService | null = null;
async function cb(): Promise<CallbackService> {
  if (!cbService) cbService = await import("../lib/payment-callback-service");
  return cbService;
}

interface PurchaseSpec {
  plan?: "SPARK_PLUS" | "SPARK_PRO";
  status: "INITIALIZED" | "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "EXPIRED";
  providerReferenceId?: string | null;
  amountMmk?: number;
  currency?: string;
}

let providerRefSequence = 0;

async function setup(spec: PurchaseSpec) {
  const client = await db();
  const user = await client.user.create({
    data: {
      name: `s7b3_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      profileImage: "https://example.com/s7b3.jpg",
    },
  });
  userIds.push(user.id);
  const plan = spec.plan ?? "SPARK_PLUS";
  const orderId = `subpurchase_s7b3_${user.id.slice(-14)}`;
  // providerReferenceId is globally unique — one per test purchase.
  const providerReferenceId = spec.providerReferenceId === null
    ? null
    : spec.providerReferenceId ?? `pRequestId-${++providerRefSequence}`;
  const purchase = await client.subscriptionPurchase.create({
    data: {
      userId: user.id,
      requestedPlan: plan,
      amountMmk: spec.amountMmk ?? 29000,
      planConfigVersion: "1",
      currency: spec.currency ?? "MMK",
      orderReferenceId: orderId,
      idempotencyKeyHash: `hash_${user.id.slice(-14)}`,
      providerReferenceId,
      status: spec.status,
    },
  });
  // Callback fixture bound to this purchase's persisted references.
  const raw = signedCallback({
    orderId,
    merchantReferenceId: purchase.id,
    paymentRequestId: providerReferenceId ?? "pRequestId-orphan",
    amount: spec.amountMmk ?? 29000,
    currency: spec.currency ?? "MMK",
  });
  return { user, purchase, raw };
}

async function storedPurchase(id: string) {
  return (await db()).subscriptionPurchase.findUnique({ where: { id } });
}

test("live: verified success fulfills exactly once (PENDING → SUCCEEDED)", { skip: SKIP }, async () => {
  const { handleWavePaymentCallback } = await cb();
  const { purchase: p2, raw } = await setup({ status: "PENDING" });
  const result = await handleWavePaymentCallback(raw, provider);
  assert.deepEqual(result, { kind: "fulfilled", replay: false });

  const after = await storedPurchase(p2.id);
  assert.equal(after?.status, "SUCCEEDED");
  const usedRef = (JSON.parse(raw) as Record<string, unknown>).paymentRequestId as string;
  assert.equal(after?.providerReferenceId, usedRef);
  assert.ok(after?.paymentSucceededAt, "paymentSucceededAt set exactly on fulfillment");
  assert.ok(after?.periodStart);
  assert.ok(after?.subscriptionId);

  const subscription = await (await db()).subscription.findUnique({
    where: { id: after!.subscriptionId! },
  });
  assert.equal(subscription?.plan, "SPARK_PLUS");
  assert.equal(subscription?.status, "ACTIVE");

  // One Spark grant, deterministically referenced by subscription+period.
  const grants = await (await db()).sparkTransaction.findMany({
    where: {
      userId: p2.userId,
      type: "SUBSCRIPTION_GRANT",
      sparkKind: "SUBSCRIPTION",
    },
  });
  assert.equal(grants.length, 1);
  assert.equal(grants[0].amount, 100); // SPARK_PLUS subscriptionSparks

  // Duplicate callback (same event) → idempotent replay, no second grant.
  const replay = await handleWavePaymentCallback(raw, provider);
  assert.deepEqual(replay, { kind: "fulfilled", replay: true });
  const grantsAfterReplay = await (await db()).sparkTransaction.findMany({
    where: { userId: p2.userId, type: "SUBSCRIPTION_GRANT", sparkKind: "SUBSCRIPTION" },
  });
  assert.equal(grantsAfterReplay.length, 1, "no duplicate Spark grant on replay");
  const afterReplay = await storedPurchase(p2.id);
  assert.equal(afterReplay?.status, "SUCCEEDED");
  assert.equal(afterReplay?.paymentSucceededAt?.getTime(), after!.paymentSucceededAt!.getTime());
});

test("live: unknown purchase (orphan scenario) fails closed and fulfills nothing", { skip: SKIP }, async () => {
  const { handleWavePaymentCallback } = await cb();
  // Orphan: purchase INITIALIZED with providerReferenceId null — a Wave
  // callback referencing it matches NO persisted row.
  const { purchase, raw: orphanRaw } = await setup({ status: "INITIALIZED", providerReferenceId: null });
  await assert.rejects(
    () => handleWavePaymentCallback(orphanRaw, provider),
    (e: unknown) => (e as { code?: string })?.code === "purchase_not_found",
    "orphan callback must not guess the purchase",
  );
  const after = await storedPurchase(purchase.id);
  assert.equal(after?.status, "INITIALIZED");
  assert.equal(after?.providerReferenceId, null);
  assert.equal(after?.paymentSucceededAt, null);
});

test("live: wrong paymentRequestId / wrong merchant reference / unknown order rejected", { skip: SKIP }, async () => {
  const { handleWavePaymentCallback } = await cb();
  const { purchase, raw } = await setup({ status: "PENDING" });
  const realRef = (JSON.parse(raw) as Record<string, unknown>).paymentRequestId as string;

  const wrongPaymentRequest = signedCallback({
    orderId: purchase.orderReferenceId,
    merchantReferenceId: purchase.id,
    paymentRequestId: "attacker-ref",
  });
  await assert.rejects(
    () => handleWavePaymentCallback(wrongPaymentRequest, provider),
    (e: unknown) => (e as { code?: string })?.code === "purchase_not_found",
  );

  const wrongMerchantRef = signedCallback({
    orderId: purchase.orderReferenceId,
    merchantReferenceId: "somebody-elses-purchase",
    paymentRequestId: realRef,
  });
  await assert.rejects(
    () => handleWavePaymentCallback(wrongMerchantRef, provider),
    (e: unknown) => (e as { code?: string })?.code === "purchase_reference_mismatch",
    "a matched row with a mismatched merchant reference must fail closed",
  );

  const unknownOrder = signedCallback({
    orderId: "subpurchase_does_not_exist",
    merchantReferenceId: purchase.id,
    paymentRequestId: realRef,
  });
  await assert.rejects(
    () => handleWavePaymentCallback(unknownOrder, provider),
    (e: unknown) => (e as { code?: string })?.code === "purchase_not_found",
  );
});

test("live: amount mismatch, currency mismatch, and malformed amount rejected", { skip: SKIP }, async () => {
  const { handleWavePaymentCallback } = await cb();
  const { purchase, raw } = await setup({ status: "PENDING" });
  const realRef = (JSON.parse(raw) as Record<string, unknown>).paymentRequestId as string;

  const wrongAmount = signedCallback({
    orderId: purchase.orderReferenceId,
    merchantReferenceId: purchase.id,
    paymentRequestId: realRef,
    amount: 1,
  });
  await assert.rejects(
    () => handleWavePaymentCallback(wrongAmount, provider),
    (e: unknown) => (e as { code?: string })?.code === "purchase_reference_mismatch",
  );

  const wrongCurrency = signedCallback({
    orderId: purchase.orderReferenceId,
    merchantReferenceId: purchase.id,
    paymentRequestId: realRef,
    currency: "USD",
  });
  await assert.rejects(
    () => handleWavePaymentCallback(wrongCurrency, provider),
    (e: unknown) => (e as { code?: string })?.code === "purchase_reference_mismatch",
  );
  const after = await storedPurchase(purchase.id);
  assert.equal(after?.status, "PENDING", "mismatched callbacks never mutate the purchase");
});

test("live: non-success outcomes never fulfill (pending/insufficient/timeout/cancel)", { skip: SKIP }, async () => {
  const { handleWavePaymentCallback } = await cb();
  // INSUFFICIENT_BALANCE: acknowledged, stays PENDING, never settles.
  const { purchase: pIns, raw: insRawBase } = await setup({ status: "PENDING" });
  const insRef = (JSON.parse(insRawBase) as Record<string, unknown>).paymentRequestId as string;
  const insRaw = signedCallback({
    status: "INSUFFICIENT_BALANCE",
    orderId: pIns.orderReferenceId,
    merchantReferenceId: pIns.id,
    paymentRequestId: insRef,
  });
  const insResult = await handleWavePaymentCallback(insRaw, provider);
  assert.deepEqual(insResult, { kind: "acknowledged_no_change" });
  const insAfter = await storedPurchase(pIns.id);
  assert.equal(insAfter?.status, "PENDING");
  assert.equal(insAfter?.paymentSucceededAt, null);

  // Timeout status: PENDING → FAILED (provider-authoritative), NOT success.
  const { purchase: pTimeout, raw: timeoutRawBase } = await setup({ status: "PENDING" });
  const timeoutRef = (JSON.parse(timeoutRawBase) as Record<string, unknown>).paymentRequestId as string;
  const timeoutRaw = signedCallback({
    status: "TRANSACTION_TIMED_OUT",
    orderId: pTimeout.orderReferenceId,
    merchantReferenceId: pTimeout.id,
    paymentRequestId: timeoutRef,
  });
  const timeoutResult = await handleWavePaymentCallback(timeoutRaw, provider);
  assert.deepEqual(timeoutResult, { kind: "fulfilled", replay: false });
  const timeoutAfter = await storedPurchase(pTimeout.id);
  assert.equal(timeoutAfter?.status, "FAILED");
  assert.equal(timeoutAfter?.paymentSucceededAt, null);
  assert.ok(timeoutAfter?.paymentFailedAt);

  // Cancellation status: PENDING → CANCELED, never success.
  const { purchase: pCancel, raw: cancelRawBase } = await setup({ status: "PENDING" });
  const cancelRef = (JSON.parse(cancelRawBase) as Record<string, unknown>).paymentRequestId as string;
  const cancelRaw = signedCallback({
    status: "PAYMENT_REQUEST_CANCELLED",
    orderId: pCancel.orderReferenceId,
    merchantReferenceId: pCancel.id,
    paymentRequestId: cancelRef,
  });
  await handleWavePaymentCallback(cancelRaw, provider);
  const cancelAfter = await storedPurchase(pCancel.id);
  assert.equal(cancelAfter?.status, "CANCELED");
  assert.equal(cancelAfter?.paymentSucceededAt, null);
});

test("live: terminal states reject; CANCELED/EXPIRED never reopen; INITIALIZED fails closed", { skip: SKIP }, async () => {
  const { handleWavePaymentCallback } = await cb();
  for (const status of ["CANCELED", "EXPIRED"] as const) {
    const { purchase, raw: boundRaw } = await setup({ status });
    await assert.rejects(
      () => handleWavePaymentCallback(boundRaw, provider),
      (e: unknown) => (e as { code?: string })?.code === "purchase_not_eligible",
      `${status} must never reopen into success`,
    );
    const after = await storedPurchase(purchase.id);
    assert.equal(after?.status, status);
    assert.equal(after?.paymentSucceededAt, null);
  }

  // INITIALIZED with a persisted reference and a matching callback: the
  // state machine rejects a verified success before initialization
  // (INITIALIZED → SUCCEEDED is illegal). Wave payment requests are created
  // in the same request that persists PENDING, so a callback for an
  // INITIALIZED row means persistence rolled back — fail closed.
  const { purchase: pInit, raw: initRaw } = await setup({ status: "INITIALIZED" });
  await assert.rejects(
    () => handleWavePaymentCallback(initRaw, provider),
    (e: unknown) => (e as { code?: string })?.code === "purchase_not_eligible",
  );
  const initAfter = await storedPurchase(pInit.id);
  assert.equal(initAfter?.status, "INITIALIZED");
});

test("live: concurrency — simultaneous identical callbacks produce exactly one grant", { skip: SKIP }, async () => {
  const { handleWavePaymentCallback } = await cb();
  const { purchase: p, raw } = await setup({ status: "PENDING" });

  const results = await Promise.allSettled([
    handleWavePaymentCallback(raw, provider),
    handleWavePaymentCallback(raw, provider),
    handleWavePaymentCallback(raw, provider),
  ]);

  const after = await storedPurchase(p.id);
  assert.equal(after?.status, "SUCCEEDED");
  assert.ok(after?.paymentSucceededAt);
  assert.ok(after?.subscriptionId, "one subscription row linked");

  const grants = await (await db()).sparkTransaction.findMany({
    where: { userId: p.userId, type: "SUBSCRIPTION_GRANT", sparkKind: "SUBSCRIPTION" },
  });
  assert.equal(grants.length, 1, "exactly one Spark grant under concurrency");

  const subscriptions = await (await db()).subscription.findMany({
    where: { userId: p.userId },
  });
  assert.equal(subscriptions.length, 1, "no duplicate subscription rows");

  const settled = results.filter((r) => r.status === "fulfilled").length;
  assert.ok(settled >= 1, "at least one callback reported fulfillment");
});

test("live: S7-A boundary — client-shaped data cannot mint verification", { skip: SKIP }, async () => {
  const { fulfillVerifiedPurchase, SubscriptionPurchaseServiceError } =
    await import("../lib/subscription-purchase-service");
  const { purchase } = await setup({ status: "PENDING" });
  // An attacker-controlled object structurally mimicking verification.
  const forged = {
    orderReferenceId: purchase.orderReferenceId,
    amountMmk: purchase.amountMmk,
    currency: purchase.currency,
    verificationReference: "forged-ref",
    verifiedAt: new Date(),
    periodStart: new Date(),
  } as unknown as Parameters<typeof fulfillVerifiedPurchase>[2];
  await assert.rejects(
    () => fulfillVerifiedPurchase(purchase.userId, purchase.id, forged),
    (e: unknown) =>
      e instanceof SubscriptionPurchaseServiceError &&
      e.code === "payment_verification_required",
    "brandless verification object must be rejected",
  );
  const after = await storedPurchase(purchase.id);
  assert.equal(after?.status, "PENDING");
});

before(async () => {
  if (!hasDb) return;
  const client = await db();
  await client.user.deleteMany({ where: { name: { startsWith: "s7b3_" } } });
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
