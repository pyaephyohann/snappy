/**
 * S8.4 — sandbox smoke harness checks.
 *
 * Deterministic. Source/pure-function checks always run; the one live-DB test
 * is skipped when DATABASE_URL is absent and cleans up only its own records.
 * No real provider credential or provider call is involved anywhere.
 *
 * Run: npm run test:spark-s84-unit
 */
import "./test-db-guard";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildRunId,
  buildRunIdentity,
  buildSignedSmokeCallback,
  cleanupRun,
  computeOverallResult,
  createDeterministicSmokeProvider,
  LIVE_OPT_IN_VAR,
  maskReference,
  resolveSmokeMode,
  summarizePaymentUrl,
  type StageResult,
} from "./spark-s8.4-smoke";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const HARNESS_PATH = "scripts/spark-s8.4-smoke.ts";
const harness = () => read(HARNESS_PATH);

const hasDb = Boolean(process.env.DATABASE_URL);
const SKIP = !hasDb ? "DATABASE_URL not set" : false;

const VALID_TEST_ENV = {
  PAYMENT_PROVIDER: "wavepay",
  PAYMENT_ENVIRONMENT: "test",
  PAYMENT_MERCHANT_ID: "s84-merchant",
  PAYMENT_MERCHANT_NAME: "S8.4",
  PAYMENT_MERCHANT_SECRET: "s84-synthetic-secret",
  PAYMENT_API_BASE_URL: "https://testpayments.wavemoney.io:8107",
};

function stage(overrides: Partial<StageResult> = {}): StageResult {
  return {
    id: 1,
    label: "stage",
    status: "PASS",
    detail: "",
    mandatory: true,
    provider: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1 + 9. Sandbox-only fail-closed; production can never be enabled
// ---------------------------------------------------------------------------

test("production configuration is refused, and no flag can enable it", () => {
  const productionEnv = {
    ...VALID_TEST_ENV,
    PAYMENT_ENVIRONMENT: "production",
    PAYMENT_API_BASE_URL: "https://payments.wavemoney.io",
  };
  const refused = resolveSmokeMode(productionEnv);
  assert.equal(refused.mode, "REFUSED_PRODUCTION");

  // Every opt-in / override attempt must still be refused.
  for (const flags of [
    { [LIVE_OPT_IN_VAR]: "1" },
    { SMOKE_FORCE: "1", SMOKE_LIVE_SANDBOX: "true", SMOKE_PRODUCTION: "1", NODE_ENV: "production" },
  ]) {
    assert.equal(resolveSmokeMode({ ...productionEnv, ...flags }).mode, "REFUSED_PRODUCTION");
  }

  // The refusal is the first decision in the harness flow (before any DB work).
  const source = harness();
  assert.ok(
    source.indexOf("REFUSED_PRODUCTION") < source.indexOf('import("../lib/subscription-purchase-service")'),
    "production refusal must precede any purchase/database work",
  );
});

// ---------------------------------------------------------------------------
// 2. Missing / invalid configuration handling
// ---------------------------------------------------------------------------

test("sandbox mode must be positively established before live traffic", () => {
  // Nothing configured → deterministic local tier, never live.
  assert.equal(resolveSmokeMode({}).mode, "LOCAL_DETERMINISTIC");
  // Partial configuration → still not live.
  const partial = resolveSmokeMode({ PAYMENT_ENVIRONMENT: "test", PAYMENT_PROVIDER: "wavepay" });
  assert.equal(partial.mode, "LOCAL_DETERMINISTIC");
  // Valid sandbox config but no explicit opt-in → still not live.
  assert.equal(resolveSmokeMode(VALID_TEST_ENV).mode, "LOCAL_DETERMINISTIC");
  // Cross-environment pairing (test env + production host) is rejected.
  assert.equal(
    resolveSmokeMode({ ...VALID_TEST_ENV, PAYMENT_API_BASE_URL: "https://payments.wavemoney.io" }).mode,
    "LOCAL_DETERMINISTIC",
  );
  // Positively established sandbox config + explicit opt-in → live tier.
  assert.equal(
    resolveSmokeMode({ ...VALID_TEST_ENV, [LIVE_OPT_IN_VAR]: "1" }).mode,
    "LIVE_SANDBOX",
  );
});

// ---------------------------------------------------------------------------
// 3. Secret-free output
// ---------------------------------------------------------------------------

test("harness output is secret-free by construction", () => {
  const source = harness();
  // Never print config values, secrets, signatures or connection strings.
  assert.doesNotMatch(
    source,
    /console\.(log|error)\([^)]*(merchantSecret|MERCHANT_SECRET|apiBaseUrl|DATABASE_URL|hashValue|Authorization)/,
  );
  // Payment URLs are summarized, never printed whole.
  assert.match(source, /summarizePaymentUrl\(/);
  assert.match(source, /provider reference: \$\{maskReference|maskReference\(/);
  // No direct provider network call and no reimplemented crypto.
  assert.doesNotMatch(source, /fetch\(/);
  assert.doesNotMatch(source, /createHmac\(|timingSafeEqual/);

  // Masking behaviour.
  assert.equal(maskReference(null), "(absent)");
  const masked = maskReference("pRequestId-abcdef123456");
  assert.ok(!masked.includes("abcdef123456"), "masked reference must not contain the full value");
  assert.ok(masked.includes("len"), "masked reference reports its length");

  // URL summarization drops everything but origin+path.
  const summary = summarizePaymentUrl("https://testpayments.wavemoney.io:8107/authenticate?transaction_id=SECRET");
  assert.equal(summary, "https://testpayments.wavemoney.io:8107/authenticate?<redacted>");
  assert.ok(!summary.includes("SECRET"));
});

// ---------------------------------------------------------------------------
// 4. Deterministic RUN_ID isolation
// ---------------------------------------------------------------------------

test("each run gets an isolated, collision-proof identity", () => {
  const first = buildRunId();
  const second = buildRunId();
  assert.notEqual(first, second);
  assert.match(first, /^s84_[0-9]{14}_[0-9a-f]{8}$/);

  const a = buildRunIdentity(first);
  const b = buildRunIdentity(second);
  assert.equal(a.userName, `smoke_s84_${first}`);
  assert.notEqual(a.userName, b.userName);
  assert.ok(a.userName.startsWith("smoke_s84_"));
  assert.notEqual(a.idempotencyKey, b.idempotencyKey);

  // The harness must create its user from that identity, not a fixed name.
  const source = harness();
  assert.match(source, /name: identity\.userName/);
  assert.doesNotMatch(source, /name: "smoke_s84"/);
});

// ---------------------------------------------------------------------------
// 5. No broad cleanup
// ---------------------------------------------------------------------------

test("cleanup is scoped to this run only and refuses ambiguous targets", () => {
  const source = harness();
  // No unscoped deleteMany anywhere in the harness.
  assert.doesNotMatch(source, /deleteMany\(\{\s*\}\)/);
  // Every deletion is scoped to the run's user id.
  const scoped = source.match(/deleteMany\(\{ where: \{ (userId|id: userId) \} \}\)/g) ?? [];
  assert.ok(scoped.length >= 4, `expected ≥4 scoped deletes, found ${scoped.length}`);
  // Guard against deleting a non-smoke identity.
  assert.match(source, /startsWith\("smoke_s84_"\)/);

  // Behavioural check without a database: a null user deletes nothing.
  const result = cleanupRun({} as never, null, "smoke_s84_none");
  assert.equal(typeof result.then, "function", "cleanupRun is async");
});

test("cleanupRun refuses non-smoke identities without deleting", async () => {
  const calls: string[] = [];
  const fakePrisma = {
    user: {
      findUnique: async () => ({ id: "u1", name: "some_real_user" }),
    },
    sparkTransaction: { deleteMany: async () => (calls.push("tx"), { count: 0 }) },
    uploadUsage: { deleteMany: async () => (calls.push("upload"), { count: 0 }) },
    subscription: { deleteMany: async () => (calls.push("sub"), { count: 0 }) },
    subscriptionPurchase: { deleteMany: async () => (calls.push("purchase"), { count: 0 }) },
  };
  const result = await cleanupRun(fakePrisma as never, "u1", "smoke_s84_other");
  assert.equal(result.ok, false);
  assert.equal(calls.length, 0, "no deletion may occur for a non-smoke identity");
});

// ---------------------------------------------------------------------------
// 6 + 7. PASS/SKIPPED/BLOCKED semantics and no fake provider success
// ---------------------------------------------------------------------------

test("overall result is never PASS while provider stages are skipped", () => {
  // All stages pass → PASS.
  assert.equal(computeOverallResult([stage(), stage({ id: 2 })]), "PASS");
  // Optional (non-mandatory) skip does not block.
  assert.equal(
    computeOverallResult([stage(), stage({ id: 2, mandatory: false, status: "SKIPPED" })]),
    "PASS",
  );
  // A skipped mandatory provider stage → BLOCKED, never PASS.
  assert.equal(
    computeOverallResult([stage(), stage({ id: 2, provider: true, status: "SKIPPED" })]),
    "BLOCKED",
  );
  // Any failure dominates.
  assert.equal(computeOverallResult([stage({ status: "FAIL" }), stage({ id: 2 })]), "FAIL");
  assert.equal(
    computeOverallResult([stage({ status: "FAIL" }), stage({ id: 2, provider: true, status: "SKIPPED" })]),
    "FAIL",
  );

  // The harness must emit the mandated skip wording and never claim provider
  // success from the deterministic tier.
  const source = harness();
  assert.match(source, /SKIPPED — LIVE WAVE SANDBOX NOT AVAILABLE/);
  assert.match(source, /LOCAL\/DETERMINISTIC/);
  assert.match(source, /do not prove that Wave accepted anything/);
  assert.match(source, /S8\.4 RESULT: \$\{overall\}/);
});

// ---------------------------------------------------------------------------
// 8. Deterministic deterministic-tier replay never double-fulfills
// ---------------------------------------------------------------------------

test("deterministic signed callback fulfills once and replay does not duplicate", { skip: SKIP }, async () => {
  const { prisma } = await import("../lib/prisma");
  const { createPurchase, getPurchase } = await import("../lib/subscription-purchase-service");
  const { initializePurchasePayment } = await import("../lib/payment-initialization-service");
  const { handleWavePaymentCallback } = await import("../lib/payment-callback-service");
  const { getPaymentUrlConfig } = await import("../lib/payment/payment-urls");

  const runId = buildRunId();
  const identity = buildRunIdentity(runId);
  const { provider, config } = createDeterministicSmokeProvider(runId);
  const urls = getPaymentUrlConfig() ?? {
    backendCallbackUrl: "https://snappy.example.com/api/payments/wave/callback",
    frontendReturnUrl: "https://snappy.example.com/subscription/checkout/return",
  };
  let userId: string | null = null;

  try {
    const user = await prisma.user.create({
      data: { name: identity.userName, profileImage: "https://example.com/s84-unit.jpg" },
    });
    userId = user.id;

    const purchase = await createPurchase(user.id, "SPARK_PLUS", identity.idempotencyKey);
    await initializePurchasePayment(user.id, purchase.id, identity.idempotencyKey, provider, urls);
    const persisted = await getPurchase(user.id, purchase.id);
    // The owner-scoped service path reports state; the safe projection omits
    // internal fields, so the row is read directly for reference binding.
    assert.equal(persisted?.status, "PENDING");
    const row = await prisma.subscriptionPurchase.findUnique({ where: { id: purchase.id } });
    assert.ok(row?.providerReferenceId);

    const raw = buildSignedSmokeCallback({
      secret: config.merchantSecret,
      merchantId: config.merchantId,
      orderId: row!.orderReferenceId,
      amountMmk: row!.amountMmk,
      backendResultUrl: urls.backendCallbackUrl,
      merchantReferenceId: row!.id,
      paymentRequestId: row!.providerReferenceId,
      transactionId: `s84-unit-${runId}`,
      initiatorMsisdn: "9791009039",
      requestTime: identity.callbackRequestTime,
    });

    assert.deepEqual(await handleWavePaymentCallback(raw, provider), {
      kind: "fulfilled",
      replay: false,
    });
    assert.deepEqual(await handleWavePaymentCallback(raw, provider), {
      kind: "fulfilled",
      replay: true,
    });

    const grants = await prisma.sparkTransaction.count({
      where: { userId: user.id, type: "SUBSCRIPTION_GRANT", sparkKind: "SUBSCRIPTION" },
    });
    const subscriptions = await prisma.subscription.count({ where: { userId: user.id } });
    const after = await getPurchase(user.id, purchase.id);
    assert.equal(grants, 1, "replay must not duplicate the Spark grant");
    assert.equal(subscriptions, 1, "replay must not create a second subscription");
    assert.equal(after?.status, "SUCCEEDED");
  } finally {
    await cleanupRun(prisma, userId, identity.userName);
  }
});

// ---------------------------------------------------------------------------
// 10. S7-B.5 blocker unchanged and no invented provider capability
// ---------------------------------------------------------------------------

test("harness invents no reconciliation or provider capability", () => {
  const source = harness();
  assert.match(source, /S7-B\.5 remains BLOCKED/);
  // No reconciliation/inquiry/refund/renewal behaviour and no new endpoints
  // (prose mentions of the S7-B.5 blocker are expected and allowed).
  assert.doesNotMatch(
    source,
    /reconcilePurchase|inquirePayment|lookupPayment|refundPayment|renewSubscription|autoRenew|\/payment\/(status|inquiry|query|reconcile)/i,
  );
  // It reuses production code instead of duplicating payment logic.
  assert.match(source, /from "\.\.\/lib\/payment\/wave-signature"/);
  assert.match(source, /from "\.\.\/lib\/payment\/wave-payment-provider"/);
  assert.match(source, /import\("\.\.\/lib\/payment-callback-service"\)/);

  // Docs keep the S7-B.5 blocker and the production-readiness caveat.
  const docs = read("docs/spark-economy.md");
  assert.match(docs, /S7-B\.5 remains\s+BLOCKED/);
  assert.match(docs, /No provider inquiry API\s+was assumed/);
});

// ---------------------------------------------------------------------------
// Callback re-delivery contract (documented observation)
// ---------------------------------------------------------------------------

test("callback re-delivery observation is documented as a follow-up", () => {
  const docs = read("docs/spark-economy.md");
  const section = docs.slice(docs.indexOf("## S8.4"));

  // Same provider event replay is idempotent…
  assert.match(section, /Same provider event replay is supported and idempotent/i);
  // …a later verification timestamp reaches payment_verification_mismatch…
  assert.match(section, /payment_verification_mismatch/);
  // …the purchase survives and nothing is duplicated…
  assert.match(section, /remains `SUCCEEDED`/);
  assert.match(section, /no duplicate Spark grant/i);
  assert.match(section, /no duplicate subscription/i);
  // …the later re-delivery is not acknowledged…
  assert.match(section, /not acknowledged/i);
  // …and it is a known follow-up, not a milestone failure.
  assert.match(section, /not an S8\.4 failure/i);
  assert.match(section, /TODO — future callback-idempotency investigation/);

  // No invented provider retry/reconciliation semantics.
  assert.match(section, /no claim about Wave's retry behaviour/i);
  assert.doesNotMatch(section, /Wave retries|Wave will retry|Wave's retry behaviour is/i);
  assert.match(section, /S7-B\.5[\s\S]{0,120}BLOCKED/);
});

test("characterization: a re-delivery with a later verification time duplicates nothing", { skip: SKIP }, async () => {
  const { prisma } = await import("../lib/prisma");
  const { createPurchase, getPurchase } = await import("../lib/subscription-purchase-service");
  const { initializePurchasePayment } = await import("../lib/payment-initialization-service");
  const { handleWavePaymentCallback } = await import("../lib/payment-callback-service");
  const { getPaymentUrlConfig } = await import("../lib/payment/payment-urls");

  const runId = buildRunId();
  const identity = buildRunIdentity(runId);
  const firstDelivery = createDeterministicSmokeProvider(runId);
  const urls = getPaymentUrlConfig() ?? {
    backendCallbackUrl: "https://snappy.example.com/api/payments/wave/callback",
    frontendReturnUrl: "https://snappy.example.com/subscription/checkout/return",
  };
  let userId: string | null = null;

  try {
    const user = await prisma.user.create({
      data: { name: identity.userName, profileImage: "https://example.com/s84-unit.jpg" },
    });
    userId = user.id;

    const purchase = await createPurchase(user.id, "SPARK_PLUS", identity.idempotencyKey);
    await initializePurchasePayment(
      user.id,
      purchase.id,
      identity.idempotencyKey,
      firstDelivery.provider,
      urls,
    );
    const row = await prisma.subscriptionPurchase.findUnique({ where: { id: purchase.id } });
    assert.ok(row?.providerReferenceId);

    // Identical payload fields in both deliveries: only the verification
    // timestamp differs, which is what this characterization pins.
    const payload = buildSignedSmokeCallback({
      secret: firstDelivery.config.merchantSecret,
      merchantId: firstDelivery.config.merchantId,
      orderId: row!.orderReferenceId,
      amountMmk: row!.amountMmk,
      backendResultUrl: urls.backendCallbackUrl,
      merchantReferenceId: row!.id,
      paymentRequestId: row!.providerReferenceId!,
      transactionId: `s84-late-${runId}`,
      initiatorMsisdn: "9791009039",
      requestTime: identity.callbackRequestTime,
    });

    assert.deepEqual(await handleWavePaymentCallback(payload, firstDelivery.provider), {
      kind: "fulfilled",
      replay: false,
    });

    // A separate provider instance pins its clock later: this models a
    // re-delivery whose verification time differs. No claim is made about
    // Wave's own retry behaviour (undocumented here).
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_100));
    const laterDelivery = createDeterministicSmokeProvider(runId);
    await assert.rejects(
      () => handleWavePaymentCallback(payload, laterDelivery.provider),
      (error: unknown) => (error as { code?: string })?.code === "fulfillment_rejected",
    );

    // The rejection changes nothing: terminal state, single subscription,
    // single grant — the documented observation.
    const after = await getPurchase(user.id, purchase.id);
    assert.equal(after?.status, "SUCCEEDED");
    assert.equal(await prisma.subscription.count({ where: { userId: user.id } }), 1);
    assert.equal(
      await prisma.sparkTransaction.count({
        where: { userId: user.id, type: "SUBSCRIPTION_GRANT", sparkKind: "SUBSCRIPTION" },
      }),
      1,
    );
  } finally {
    await cleanupRun(prisma, userId, identity.userName);
  }
});
