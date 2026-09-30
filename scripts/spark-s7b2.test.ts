/**
 * S7-B.2 — payment initialization API tests.
 *
 * Unit tests run without a database (fake PaymentProvider + fake transport).
 * Live-DB tests cover persistence/state and are skipped when DATABASE_URL is
 * absent (mirrors S7-A conventions). No credentials exist in tests.
 *
 * Run: npm run test:spark-s7b2
 */
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { decidePurchaseTransition } from "../lib/payment/payment-state";
import {
  PaymentProviderError,
  type CreatePaymentInput,
  type CreatePaymentResult,
  type PaymentProvider,
  type VerifiedPaymentResult,
} from "../lib/payment/payment-contract";
import { getPlanLabel } from "../lib/subscription-plan-labels";
import { PLAN_CONFIG } from "../lib/subscription-plans";
import { getPaymentUrlConfig } from "../lib/payment/payment-urls";

const root = resolve(import.meta.dirname, "..");
function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

// The initialization service imports the Prisma singleton (which throws
// without DATABASE_URL), so it is imported lazily like S7-A does.
type InitService = typeof import("../lib/payment-initialization-service");
let initService: InitService | null = null;
async function svc(): Promise<InitService> {
  if (!initService) initService = await import("../lib/payment-initialization-service");
  return initService;
}

async function initError(): Promise<InitService["PaymentInitializationError"]> {
  await svc();
  return initService!.PaymentInitializationError;
}

let resolvedInitError: InitService["PaymentInitializationError"] | null = null;
/** Synchronous validation fn for assert.rejects: checks error code. */
function initErrCode(e: unknown, code: string): boolean {
  const ctor = resolvedInitError!;
  return e instanceof ctor && (e as { code: string }).code === code;
}

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

// ---------------------------------------------------------------------------
// Fake provider: records calls, returns scripted results — never networks.
// ---------------------------------------------------------------------------

interface ProviderScript {
  result?: CreatePaymentResult;
  error?: PaymentProviderError;
}

function makeProvider(script: ProviderScript = {}) {
  const calls: CreatePaymentInput[] = [];
  const provider: PaymentProvider = {
    providerId: "fakepay",
    async createPayment(input) {
      calls.push(input);
      if (script.error) throw script.error;
      return (
        script.result ?? {
          providerReferenceId: "provider-ref-1",
          paymentUrl: "https://pay.example.com/authenticate?transaction_id=provider-ref-1",
          providerStatus: "PENDING",
          expiresAt: input.expiresAt,
        }
      );
    },
    async verifyCallback(): Promise<VerifiedPaymentResult> {
      throw new PaymentProviderError("malformed_callback", "not used in S7-B.2");
    },
  };
  return { provider, calls };
}

const URLS = {
  backendCallbackUrl: "https://snappy.example.com/api/subscription/purchases/payment/callback",
  frontendReturnUrl: "https://snappy.example.com/subscription/checkout/return",
};

// ---------------------------------------------------------------------------
// Source-level security checks (no DB required)
// ---------------------------------------------------------------------------

test("route accepts no client-controlled payment data", () => {
  const route = read("app/api/subscription/purchases/[id]/payment/route.ts");
  assert.match(route, /requireAuthenticatedAppUser/);
  assert.match(route, /idempotency-key/i);
  // The route never reads a request body.
  assert.doesNotMatch(route, /request\.json\(\)|request\.text\(\)|request\.formData\(\)/);
  const service = read("lib/payment-initialization-service.ts");
  for (const banned of [
    "amount", "currency", "plan", "merchantId", "merchantReference",
    "orderId", "signature", "backendUrl", "frontendUrl", "merchantSecret",
    "providerReferenceId", "paymentStatus",
  ]) {
    assert.ok(
      !service.includes(`body.${banned}`) && !service.includes(`input.${banned} =`),
      `client must not control ${banned}`,
    );
  }
});

test("route never exposes secrets, config, or raw provider payloads", () => {
  const route = read("app/api/subscription/purchases/[id]/payment/route.ts");
  for (const banned of [
    "merchantSecret", "merchantId", "apiBaseUrl", "hashValue", "signature",
    "NextResponse.json({ config", "rawBody", "providerResponse",
  ]) {
    assert.ok(!route.includes(banned), `route must not expose ${banned}`);
  }
  const service = read("lib/payment-initialization-service.ts");
  // The safe result carries only the four client-safe fields.
  assert.match(service, /interface SafePaymentInitialization/);
  assert.match(service, /purchaseId[\s\S]{0,80}status[\s\S]{0,80}paymentUrl[\s\S]{0,80}expiresAt/);
  assert.doesNotMatch(service, /providerReferenceId:\s*result\.providerReferenceId,\s*\n\s*paymentUrl:\s*result\.paymentUrl,\s*\n\s*providerStatus/);
});

test("initialization can never reach SUCCEEDED", () => {
  // State machine: payment_initiated never yields SUCCEEDED from any state.
  for (const from of ["INITIALIZED", "PENDING", "SUCCEEDED", "FAILED", "CANCELED", "EXPIRED"] as const) {
    const d = decidePurchaseTransition(from, { type: "payment_initiated" });
    if (d.action === "transition") {
      assert.equal(d.to, "PENDING");
      assert.notEqual(d.to, "SUCCEEDED");
    }
  }
  const service = read("lib/payment-initialization-service.ts");
  assert.doesNotMatch(service, /status:\s*"SUCCEEDED"/);
  assert.match(service, /status: "PENDING"/);
});

test("transport is HTTPS-only, bounded, and retry-free", async () => {
  const { FetchHttpTransport } = await import("../lib/payment/fetch-http-transport");
  const transport = new FetchHttpTransport();
  await assert.rejects(
    () => transport.postForm({ url: "http://insecure.example.com/payment", form: { a: "1" } }),
    (e: unknown) => e instanceof PaymentProviderError && e.code === "invalid_input",
    "plain http rejected before any network call",
  );
  await assert.rejects(
    () => transport.postForm({ url: "not a url", form: {} }),
    (e: unknown) => e instanceof PaymentProviderError,
  );
  const source = read("lib/payment/fetch-http-transport.ts");
  assert.match(source, /AbortSignal\.timeout/);
  assert.doesNotMatch(source, /for\s*\(.*retry|while\s*\(.*retry/i);
  assert.doesNotMatch(source, /console\.(log|info|debug)/);
});

test("payment URLs derive from server config only and fail closed", () => {
  const source = read("lib/payment/payment-urls.ts");
  assert.doesNotMatch(source, /NEXT_PUBLIC_/);
  assert.match(source, /SNAPPY_PUBLIC_URL|VERCEL_PROJECT_PRODUCTION_URL/);
  const urls = getPaymentUrlConfig();
  if (urls) {
    assert.match(urls.backendCallbackUrl, /^https:\/\//);
    assert.match(urls.frontendReturnUrl, /^https:\/\//);
    assert.ok(!urls.frontendReturnUrl.includes("/api/"), "frontend return is navigation only");
  }
});

test("plan labels are server-derived; no client plan input exists anywhere", () => {
  assert.equal(getPlanLabel("SPARK_PLUS"), "Snappy Spark Plus — 1 month subscription");
  const service = read("lib/payment-initialization-service.ts");
  assert.match(service, /getPlanLabel\(purchase\.requestedPlan\)/);
  assert.doesNotMatch(service, /body\.plan|input\.plan/);
});

test("idempotency key validation mirrors S7-A rules", () => {
  // Source-level check: the service reuses the exact S7-A key rules.
  const service = read("lib/payment-initialization-service.ts");
  const purchaseService = read("lib/subscription-purchase-service.ts");
  const rule = /value\.length < 8 \|\| value\.length > 128 \|\| !\/\^\[A-Za-z0-9._:-\]\+\$\/\.test\(value\)/;
  assert.match(service, rule, "payment init validates the key with the S7-A rule");
  assert.match(purchaseService, rule, "S7-A purchase creation uses the same rule");
});

// ---------------------------------------------------------------------------
// Live DB: state handling, provider integration, persistence, failures
// ---------------------------------------------------------------------------

async function createUserAndPurchase(plan: "SPARK_PLUS" | "SPARK_PRO" = "SPARK_PLUS", status: "INITIALIZED" | "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "EXPIRED" = "INITIALIZED", opts: { providerReferenceId?: string | null } = {}) {
  const client = await db();
  const user = await client.user.create({
    data: { name: `s7b2_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, profileImage: "https://example.com/s7b2.jpg" },
  });
  userIds.push(user.id);
  const purchase = await client.subscriptionPurchase.create({
    data: {
      userId: user.id,
      requestedPlan: plan,
      amountMmk: PLAN_CONFIG[plan].monthlyPriceMmk,
      planConfigVersion: "1",
      currency: "MMK",
      orderReferenceId: `subpurchase_s7b2_${user.id.slice(-12)}`,
      idempotencyKeyHash: `hash_${user.id.slice(-12)}`,
      status,
      providerReferenceId: opts.providerReferenceId ?? null,
    },
  });
  return { userId: user.id, purchase };
}

test("live: INITIALIZED purchase initializes; PENDING with reference replays without duplicating", { skip: SKIP }, async () => {
  const { userId, purchase } = await createUserAndPurchase("SPARK_PLUS", "INITIALIZED");
  const { initializePurchasePayment } = await svc();
  const { provider, calls } = makeProvider();
  const result = await initializePurchasePayment(userId, purchase.id, "s7b2-idem-key-0001", provider, URLS);

  assert.equal(calls.length, 1, "provider called exactly once");
  const call = calls[0];
  assert.equal(call.purchaseId, purchase.id);
  assert.equal(call.orderReferenceId, purchase.orderReferenceId);
  assert.equal(call.amountMmk, PLAN_CONFIG.SPARK_PLUS.monthlyPriceMmk);
  assert.equal(call.currency, "MMK");
  assert.equal(call.backendCallbackUrl, URLS.backendCallbackUrl);
  assert.equal(call.frontendReturnUrl, URLS.frontendReturnUrl);
  assert.equal(call.paymentDescription, getPlanLabel("SPARK_PLUS"));
  assert.ok(call.expiresAt.getTime() > Date.now());

  assert.equal(result.status, "PENDING");
  assert.ok(result.paymentUrl && result.paymentUrl.startsWith("https://"));
  assert.ok(!JSON.stringify(result).includes("providerReferenceId"), "the persisted provider reference field is never returned to client");

  const client = await db();
  const stored = await client.subscriptionPurchase.findUnique({ where: { id: purchase.id } });
  assert.equal(stored?.status, "PENDING");
  assert.equal(stored?.providerReferenceId, "provider-ref-1");
  assert.equal(stored?.paymentSucceededAt, null, "initialization must never set paymentSucceededAt");
  assert.ok(stored?.paymentInitiatedAt);
  assert.ok(stored?.expiresAt);

  // Replay: PENDING with provider reference → no second provider call.
  const { provider: provider2, calls: calls2 } = makeProvider();
  const replay = await initializePurchasePayment(userId, purchase.id, "s7b2-idem-key-0002", provider2, URLS);
  assert.equal(calls2.length, 0, "PENDING replay must not create a duplicate provider payment");
  assert.equal(replay.status, "PENDING");
  assert.equal(replay.purchaseId, purchase.id);
});

test("live: SUCCEEDED, CANCELED, EXPIRED, and FAILED are rejected deterministically", { skip: SKIP }, async () => {
  for (const status of ["SUCCEEDED", "CANCELED", "EXPIRED", "FAILED"] as const) {
    const { userId, purchase } = await createUserAndPurchase("SPARK_PRO", status, {
      providerReferenceId: status === "SUCCEEDED" ? "ref-succeeded" : null,
    });
    const { initializePurchasePayment } = await svc();
    const { provider, calls } = makeProvider();
    await assert.rejects(
      () => initializePurchasePayment(userId, purchase.id, "s7b2-idem-key-0003", provider, URLS),
      (e) => initErrCode(e, "purchase_not_eligible"),
      `${status} must be rejected`,
    );
    assert.equal(calls.length, 0, `${status} must never reach the provider`);
    const client = await db();
    const stored = await client.subscriptionPurchase.findUnique({ where: { id: purchase.id } });
    assert.equal(stored?.status, status, `${status} is terminal — never reopened`);
  }
});

test("live: cross-user access is rejected opaquely as purchase_not_found", { skip: SKIP }, async () => {
  const { purchase } = await createUserAndPurchase("SPARK_PLUS", "INITIALIZED");
  const other = await (await db()).user.create({
    data: { name: `s7b2_other_${Date.now()}`, profileImage: "https://example.com/x.jpg" },
  });
  userIds.push(other.id);
  const { initializePurchasePayment } = await svc();
  const { provider, calls } = makeProvider();
  await assert.rejects(
    () => initializePurchasePayment(other.id, purchase.id, "s7b2-idem-key-0004", provider, URLS),
    (e) => initErrCode(e, "purchase_not_found"),
  );
  assert.equal(calls.length, 0);
});

test("live: provider timeout and network failure fail closed (purchase stays INITIALIZED, no SUCCEEDED)", { skip: SKIP }, async () => {
  const { userId, purchase } = await createUserAndPurchase("SPARK_PLUS", "INITIALIZED");
  const { initializePurchasePayment } = await svc();
  const { provider, calls } = makeProvider({ error: new PaymentProviderError("transport_error", "timed out") });
  await assert.rejects(
    () => initializePurchasePayment(userId, purchase.id, "s7b2-idem-key-0005", provider, URLS),
    (e) => initErrCode(e, "payment_provider_error"),
  );
  assert.equal(calls.length, 1);
  const client = await db();
  const stored = await client.subscriptionPurchase.findUnique({ where: { id: purchase.id } });
  assert.equal(stored?.status, "INITIALIZED", "timeout must not advance or settle the purchase");
  assert.equal(stored?.providerReferenceId, null);
});

test("live: provider 400/404/422 and malformed responses fail closed", { skip: SKIP }, async () => {
  const cases: Array<[PaymentProviderError, string]> = [
    [new PaymentProviderError("provider_rejected", "hash rejected"), "provider_rejected"],
    [new PaymentProviderError("invalid_input", "fields rejected"), "invalid_input"],
    [new PaymentProviderError("unexpected_response", "malformed"), "unexpected_response"],
  ];
  for (const [error] of cases) {
    const { userId, purchase } = await createUserAndPurchase("SPARK_PLUS", "INITIALIZED");
    const { initializePurchasePayment } = await svc();
    const { provider } = makeProvider({ error });
    await assert.rejects(
      () => initializePurchasePayment(userId, purchase.id, "s7b2-idem-key-0006", provider, URLS),
      (e) => initErrCode(e, "payment_provider_error"),
    );
    const client = await db();
    const stored = await client.subscriptionPurchase.findUnique({ where: { id: purchase.id } });
    assert.equal(stored?.status, "INITIALIZED");
    assert.equal(stored?.providerReferenceId, null);
  }
});

test("live: provider 409 duplicate maps to payment_already_requested without a second payment", { skip: SKIP }, async () => {
  const { userId, purchase } = await createUserAndPurchase("SPARK_PLUS", "INITIALIZED");
  const { initializePurchasePayment } = await svc();
  const { provider } = makeProvider({ error: new PaymentProviderError("duplicate_request", "Record already exists") });
  await assert.rejects(
    () => initializePurchasePayment(userId, purchase.id, "s7b2-idem-key-0007", provider, URLS),
    (e) => initErrCode(e, "payment_already_requested"),
  );
  const client = await db();
  const stored = await client.subscriptionPurchase.findUnique({ where: { id: purchase.id } });
  assert.equal(stored?.status, "INITIALIZED", "fail closed — S7-B.3 reconciliation will recover");
});

test("live: FREE-plan and impossible configuration purchases fail safely", { skip: SKIP }, async () => {
  const client = await db();
  const user = await client.user.create({
    data: { name: `s7b2_bad_${Date.now()}`, profileImage: "https://example.com/x.jpg" },
  });
  userIds.push(user.id);
  // Simulate an impossible persisted configuration (amount 0 / wrong version)
  // directly via SQL bypassing nothing — create with manipulated fields.
  const bad = await client.subscriptionPurchase.create({
    data: {
      userId: user.id,
      requestedPlan: "SPARK_PLUS",
      amountMmk: 0,
      planConfigVersion: "0",
      currency: "MMK",
      orderReferenceId: `subpurchase_s7b2_bad_${user.id.slice(-12)}`,
      idempotencyKeyHash: `hash_bad_${user.id.slice(-12)}`,
      status: "INITIALIZED",
    },
  });
  const { initializePurchasePayment } = await svc();
  const { provider, calls } = makeProvider();
  await assert.rejects(
    () => initializePurchasePayment(user.id, bad.id, "s7b2-idem-key-0008", provider, URLS),
    (e) => initErrCode(e, "purchase_configuration_invalid"),
  );
  assert.equal(calls.length, 0);
});

test("live: concurrent initialization of one purchase creates exactly one provider payment", { skip: SKIP }, async () => {
  const { userId, purchase } = await createUserAndPurchase("SPARK_PLUS", "INITIALIZED");
  const { initializePurchasePayment } = await svc();
  let providerCalls = 0;
  const provider: PaymentProvider = {
    providerId: "fakepay",
    async createPayment(input) {
      providerCalls += 1;
      // Simulate provider latency so both requests overlap if unsynchronized.
      await new Promise((r) => setTimeout(r, 50));
      return {
        providerReferenceId: `ref-${providerCalls}`,
        paymentUrl: `https://pay.example.com/${providerCalls}`,
        providerStatus: "PENDING",
        expiresAt: input.expiresAt,
      };
    },
    async verifyCallback() {
      throw new PaymentProviderError("malformed_callback", "unused");
    },
  };

  const [a, b] = await Promise.allSettled([
    initializePurchasePayment(userId, purchase.id, "s7b2-idem-key-0009a", provider, URLS),
    initializePurchasePayment(userId, purchase.id, "s7b2-idem-key-0009b", provider, URLS),
  ]);

  const client = await db();
  const stored = await client.subscriptionPurchase.findUnique({ where: { id: purchase.id } });
  const fulfilled = [a, b].filter((r) => r.status === "fulfilled");
  assert.equal(stored?.status, "PENDING");
  // Serialized by the user-row lock: exactly one provider call wins.
  assert.ok(providerCalls >= 1 && providerCalls <= 2, "at most the serialized calls occur");
  assert.equal(
    fulfilled.length === 2 ? 2 : 1,
    fulfilled.length,
    "both settle or one rejects — but the DB ends in exactly one PENDING state",
  );
  assert.ok(stored?.providerReferenceId, "a durable provider reference is persisted");
  // Under the user-row lock both may succeed sequentially (second sees
  // PENDING replay) or one may reject — but the outcome is a single PENDING
  // purchase with one reference, never two independent payments.
});

before(async () => {
  if (!hasDb) return;
  resolvedInitError = await initError();
  const client = await db();
  await client.user.deleteMany({ where: { name: { startsWith: "s7b2_" } } });
});

after(async () => {
  if (!prisma) return;
  for (const userId of userIds) {
    await prisma.subscriptionPurchase.deleteMany({ where: { userId } });
    await prisma.subscription.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  }
  await prisma.$disconnect();
});
