/**
 * S7-B.1 — payment domain + Wave adapter foundation tests.
 *
 * Pure/unit tests only: no database, no network. The Wave adapter is tested
 * through an injected fake HTTP transport. No credentials exist in tests.
 *
 * Run: npm run test:spark-s7b1
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  decidePurchaseTransition,
  isTerminalPurchaseStatus,
  type PurchaseLifecycleStatus,
} from "../lib/payment/payment-state";
import {
  computeWaveHmac,
  verifyWaveHmac,
  waveCallbackHashMessage,
  waveRequestHashMessage,
} from "../lib/payment/wave-signature";
import { createWavePaymentProvider } from "../lib/payment/wave-payment-provider";
import { PaymentProviderError, type CreatePaymentInput } from "../lib/payment/payment-contract";
import { resolveWaveProviderConfig, PaymentConfigError } from "../lib/payment/payment-config";
import type { HttpTransport, PaymentHttpRequest, PaymentHttpResponse } from "../lib/payment/http-transport";

const root = resolve(import.meta.dirname, "..");
function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

const SECRET = "test-secret-key-1234";

function makeConfig() {
  return resolveWaveProviderConfig({
    PAYMENT_PROVIDER: "wavepay",
    PAYMENT_ENVIRONMENT: "test",
    PAYMENT_MERCHANT_ID: "testmerchantID",
    PAYMENT_MERCHANT_NAME: "Test Merchant",
    PAYMENT_MERCHANT_SECRET: SECRET,
    PAYMENT_API_BASE_URL: "https://testpayments.wavemoney.io:8107",
  });
}

function makeInput(overrides: Partial<CreatePaymentInput> = {}): CreatePaymentInput {
  return {
    purchaseId: "purchase-1",
    orderReferenceId: "subpurchase_abc",
    amountMmk: 29000,
    currency: "MMK",
    expiresAt: new Date("2030-01-01T10:10:00.000Z"),
    backendCallbackUrl: "https://snappy.example.com/api/payments/wavepay/callback",
    frontendReturnUrl: "https://snappy.example.com/profile",
    paymentDescription: "Spark Plus — 1 month",
    ...overrides,
  };
}

/** Fake transport: records requests, returns a scripted response, never networks. */
function makeTransport(response: PaymentHttpResponse) {
  const requests: PaymentHttpRequest[] = [];
  const transport: HttpTransport = {
    async postForm(request) {
      requests.push(request);
      return response;
    },
  };
  return { transport, requests };
}

const FIXED_NOW = new Date("2030-01-01T10:00:00.000Z");

// ===========================================================================
// State machine
// ===========================================================================

test("state machine: valid transitions carry the right kind", () => {
  const cases: Array<[PurchaseLifecycleStatus, Parameters<typeof decidePurchaseTransition>[1], PurchaseLifecycleStatus, string]> = [
    ["INITIALIZED", { type: "payment_initiated" }, "PENDING", "provider_authoritative"],
    ["INITIALIZED", { type: "user_canceled" }, "CANCELED", "user_cancellation"],
    ["PENDING", { type: "provider_outcome", outcome: "SUCCEEDED" }, "SUCCEEDED", "provider_authoritative"],
    ["PENDING", { type: "provider_outcome", outcome: "FAILED" }, "FAILED", "provider_authoritative"],
    ["PENDING", { type: "provider_outcome", outcome: "TIMED_OUT" }, "FAILED", "provider_authoritative"],
    ["PENDING", { type: "provider_outcome", outcome: "CANCELED" }, "CANCELED", "provider_authoritative"],
    ["PENDING", { type: "user_canceled" }, "CANCELED", "user_cancellation"],
    ["PENDING", { type: "server_timeout" }, "EXPIRED", "server_timeout"],
    ["FAILED", { type: "provider_outcome", outcome: "SUCCEEDED" }, "SUCCEEDED", "reconciliation"],
  ];
  for (const [from, event, to, kind] of cases) {
    const d = decidePurchaseTransition(from, event);
    assert.equal(d.action, "transition", `${from} + ${event.type} should transition`);
    if (d.action === "transition") {
      assert.equal(d.from, from);
      assert.equal(d.to, to);
      assert.equal(d.kind, kind);
    }
  }
});

test("state machine: invalid transitions are rejected", () => {
  const cases: Array<[PurchaseLifecycleStatus, Parameters<typeof decidePurchaseTransition>[1]]> = [
    ["INITIALIZED", { type: "provider_outcome", outcome: "SUCCEEDED" }],
    ["INITIALIZED", { type: "server_timeout" }],
    ["FAILED", { type: "provider_outcome", outcome: "CANCELED" }],
    ["FAILED", { type: "user_canceled" }],
    ["FAILED", { type: "server_timeout" }],
    ["FAILED", { type: "payment_initiated" }],
  ];
  for (const [from, event] of cases) {
    const d = decidePurchaseTransition(from, event);
    assert.equal(d.action, "reject", `${from} + ${event.type} must be rejected`);
  }
});

test("state machine: terminal states only accept idempotent repeats", () => {
  for (const status of ["SUCCEEDED", "CANCELED", "EXPIRED"] as const) {
    assert.equal(isTerminalPurchaseStatus(status), true);
    // A fresh init attempt against a terminal purchase is always rejected.
    const d = decidePurchaseTransition(status, { type: "payment_initiated" });
    assert.equal(d.action, "reject");
    if (d.action === "reject") assert.equal(d.reason, "terminal_state");
  }
  assert.equal(
    decidePurchaseTransition("SUCCEEDED", { type: "provider_outcome", outcome: "SUCCEEDED" }).action,
    "noop",
  );
  assert.equal(decidePurchaseTransition("CANCELED", { type: "user_canceled" }).action, "noop");
  assert.equal(decidePurchaseTransition("EXPIRED", { type: "server_timeout" }).action, "noop");
});

test("state machine: INSUFFICIENT_BALANCE never settles a purchase", () => {
  for (const from of ["INITIALIZED", "PENDING", "FAILED"] as const) {
    const d = decidePurchaseTransition(from, { type: "provider_outcome", outcome: "INSUFFICIENT_BALANCE" });
    assert.notEqual(d.action, "transition", `${from} must not transition on INSUFFICIENT_BALANCE`);
  }
});

test("state machine: no client-controllable event can reach SUCCEEDED", () => {
  const allStatuses: PurchaseLifecycleStatus[] = ["INITIALIZED", "PENDING", "SUCCEEDED", "FAILED", "CANCELED", "EXPIRED"];
  const nonVerifiedEvents = [
    { type: "payment_initiated" },
    { type: "user_canceled" },
    { type: "server_timeout" },
    { type: "provider_outcome", outcome: "FAILED" },
    { type: "provider_outcome", outcome: "TIMED_OUT" },
    { type: "provider_outcome", outcome: "CANCELED" },
    { type: "provider_outcome", outcome: "INSUFFICIENT_BALANCE" },
  ] as const;
  for (const from of allStatuses) {
    for (const event of nonVerifiedEvents) {
      const d = decidePurchaseTransition(from, event);
      if (d.action === "transition") {
        assert.notEqual(d.to, "SUCCEEDED", `${from} + ${event.type} must never reach SUCCEEDED`);
      }
    }
  }
  // Only a server-verified SUCCEEDED outcome reaches SUCCEEDED.
  const d = decidePurchaseTransition("PENDING", { type: "provider_outcome", outcome: "SUCCEEDED" });
  assert.equal(d.action === "transition" && d.to, "SUCCEEDED");
});

test("state machine: status values match the Prisma PurchaseStatus enum", () => {
  const schema = read("prisma/schema.prisma");
  const block = schema.slice(schema.indexOf("enum PurchaseStatus"), schema.indexOf("}", schema.indexOf("enum PurchaseStatus")));
  for (const status of ["INITIALIZED", "PENDING", "SUCCEEDED", "FAILED", "CANCELED", "EXPIRED"]) {
    assert.match(block, new RegExp(`\\b${status}\\b`), `schema declares ${status}`);
  }
});

// ===========================================================================
// Wave signing
// ===========================================================================

test("wave signing: request hash uses the documented field order", () => {
  const message = waveRequestHashMessage({
    time_to_live_in_seconds: "600",
    merchant_id: "testmerchantID",
    order_id: "order-1",
    amount: "29000",
    backend_result_url: "https://merchant.example.com/backend-callback",
    merchant_reference_id: "ref-1",
  });
  assert.equal(
    message,
    "600" + "testmerchantID" + "order-1" + "29000" + "https://merchant.example.com/backend-callback" + "ref-1",
  );
});

test("wave signing: callback hash uses the documented field order", () => {
  const message = waveCallbackHashMessage({
    status: "PAYMENT_CONFIRMED",
    timeToLiveSeconds: "300",
    merchantId: "testmerchantID",
    orderId: "order-1",
    amount: "29000",
    backendResultUrl: "https://merchant.example.com/backend-callback",
    merchantReferenceId: "ref-1",
    initiatorMsisdn: "9791009039",
    transactionId: "360",
    paymentRequestId: "360",
    requestTime: "2019-11-06T15:38:56",
  });
  assert.equal(
    message,
    "PAYMENT_CONFIRMED" + "300" + "testmerchantID" + "order-1" + "29000" +
      "https://merchant.example.com/backend-callback" + "ref-1" + "9791009039" + "360" + "360" + "2019-11-06T15:38:56",
  );
});

test("wave signing: documented null rule hashes null as the literal 'null'", () => {
  // Documented rule: a null value contributes the literal "null" between its
  // neighbours (documented example: msisdn+null+merchantId →
  // "9791009039nulltestmerchantID"). Applied to the callback field order:
  // merchantId + null(orderId) + amount → "testmerchantIDnull29000".
  const message = waveCallbackHashMessage({
    status: "s",
    timeToLiveSeconds: "t",
    merchantId: "testmerchantID",
    orderId: null,
    amount: "29000",
    backendResultUrl: "b",
    merchantReferenceId: "r",
    initiatorMsisdn: "9791009039",
    transactionId: null,
    paymentRequestId: "p",
    requestTime: "t",
  });
  assert.ok(message.includes("testmerchantIDnull29000"), "null orderId hashes as 'null' between values");
  assert.ok(message.includes("9791009039nullp"), "null transactionId hashes as 'null' between values");
});

test("wave signing: deterministic HMAC-SHA256 matching an independent implementation", () => {
  const message = "HelloMessage";
  const expected = createHmac("sha256", SECRET).update(message, "utf8").digest("hex");
  assert.equal(computeWaveHmac(message, SECRET), expected);
  assert.equal(computeWaveHmac(message, SECRET), computeWaveHmac(message, SECRET), "deterministic");
});

test("wave signing: valid signature accepted, modified payload/signature rejected", () => {
  const message = waveRequestHashMessage({
    time_to_live_in_seconds: "600",
    merchant_id: "m",
    order_id: "o",
    amount: "1000",
    backend_result_url: "b",
    merchant_reference_id: "r",
  });
  const signature = computeWaveHmac(message, SECRET);
  assert.equal(verifyWaveHmac(message, signature, SECRET), true);

  // Modified payload → different message → rejected.
  const tampered = message.replace("1000", "9999");
  assert.equal(verifyWaveHmac(tampered, signature, SECRET), false);

  // Modified signature → rejected.
  const flipped = (signature[0] === "a" ? "b" : "a") + signature.slice(1);
  assert.equal(verifyWaveHmac(message, flipped, SECRET), false);

  // Wrong secret → rejected.
  assert.equal(verifyWaveHmac(message, signature, "other-secret"), false);
});

test("wave signing: malformed signatures are rejected without throwing", () => {
  const message = "m";
  for (const bad of ["", "zz", "not-hex-at-all", "abcd", computeWaveHmac(message, SECRET).slice(0, 63), "G".repeat(64)]) {
    assert.equal(verifyWaveHmac(message, bad, SECRET), false, `rejects ${JSON.stringify(bad)}`);
  }
});

// ===========================================================================
// Wave adapter — createPayment via fake transport (no network)
// ===========================================================================

test("wave adapter: createPayment builds the documented form and hash", async () => {
  const { transport, requests } = makeTransport({
    status: 200,
    body: { message: "success", transaction_id: "encrypted-tx-1" },
  });
  const provider = createWavePaymentProvider({
    config: makeConfig(),
    transport,
    now: () => FIXED_NOW,
  });

  const result = await provider.createPayment(makeInput());

  assert.equal(requests.length, 1, "exactly one transport call, no real network");
  const req = requests[0];
  assert.equal(req.url, "https://testpayments.wavemoney.io:8107/payment");
  assert.equal(req.form.merchant_id, "testmerchantID");
  assert.equal(req.form.order_id, "subpurchase_abc");
  assert.equal(req.form.merchant_reference_id, "purchase-1");
  assert.equal(req.form.amount, "29000");
  assert.equal(req.form.time_to_live_in_seconds, "600");
  assert.equal(req.form.backend_result_url, makeInput().backendCallbackUrl);
  assert.equal(req.form.frontend_result_url, makeInput().frontendReturnUrl);
  assert.equal(req.form.merchant_name, "Test Merchant");
  assert.equal(JSON.parse(req.form.items).length, 1);

  // Hash must match the documented formula over the documented fields.
  const expectedHash = computeWaveHmac(
    "600" + "testmerchantID" + "subpurchase_abc" + "29000" + makeInput().backendCallbackUrl + "purchase-1",
    SECRET,
  );
  assert.equal(req.form.hash, expectedHash);

  assert.equal(result.providerReferenceId, "encrypted-tx-1");
  assert.equal(result.providerStatus, "PENDING");
  assert.equal(
    result.paymentUrl,
    "https://testpayments.wavemoney.io:8107/authenticate?transaction_id=encrypted-tx-1",
  );
});

test("wave adapter: createPayment normalizes documented error responses", async () => {
  const cases: Array<[number, unknown, string]> = [
    [409, { message: "Record already exists" }, "duplicate_request"],
    [400, { message: "INVALID_HASH" }, "provider_rejected"],
    [404, { message: "No record found" }, "provider_rejected"],
    [422, { errors: {} }, "invalid_input"],
    [200, { message: "success" }, "unexpected_response"],
    [500, null, "unexpected_response"],
  ];
  for (const [status, body, code] of cases) {
    const { transport } = makeTransport({ status, body });
    const provider = createWavePaymentProvider({ config: makeConfig(), transport, now: () => FIXED_NOW });
    await assert.rejects(
      () => provider.createPayment(makeInput()),
      (e: unknown) => e instanceof PaymentProviderError && e.code === code,
      `status ${status} → ${code}`,
    );
  }
});

test("wave adapter: createPayment rejects non-server-authoritative input", async () => {
  const { transport, requests } = makeTransport({ status: 200, body: { message: "success", transaction_id: "t" } });
  const provider = createWavePaymentProvider({ config: makeConfig(), transport, now: () => FIXED_NOW });

  await assert.rejects(
    () => provider.createPayment(makeInput({ currency: "USD" })),
    (e: unknown) => e instanceof PaymentProviderError && e.code === "invalid_input",
  );
  await assert.rejects(
    () => provider.createPayment(makeInput({ amountMmk: -5 })),
    (e: unknown) => e instanceof PaymentProviderError && e.code === "invalid_input",
  );
  await assert.rejects(
    () => provider.createPayment(makeInput({ expiresAt: new Date("2029-01-01T00:00:00Z") })),
    (e: unknown) => e instanceof PaymentProviderError && e.code === "invalid_input",
  );
  await assert.rejects(
    () => provider.createPayment(makeInput({ expiresAt: new Date(FIXED_NOW.getTime() + 3600_000) })),
    (e: unknown) => e instanceof PaymentProviderError && e.code === "invalid_input",
    "TTL beyond documented 10-minute limit rejected",
  );
  assert.equal(requests.length, 0, "invalid input never reaches the transport");
});

// ===========================================================================
// Wave adapter — verifyCallback normalization (signed fixtures only)
// ===========================================================================

/** Sign the canonical base callback, then apply payload overrides WITHOUT re-signing. */
function tamperedCallback(overrides: Record<string, unknown>): string {
  const parsed = JSON.parse(signedCallback()) as Record<string, unknown>;
  return JSON.stringify({ ...parsed, ...overrides });
}

function signedCallback(overrides: Record<string, unknown> = {}): string {
  const fields: Record<string, unknown> = {
    status: "PAYMENT_CONFIRMED",
    merchantId: "testmerchantID",
    orderId: "subpurchase_abc",
    merchantReferenceId: "purchase-1",
    frontendResultUrl: "https://snappy.example.com/profile",
    backendResultUrl: makeInput().backendCallbackUrl,
    initiatorMsisdn: "9791009039",
    amount: 29000,
    timeToLiveSeconds: 300,
    paymentDescription: "Spark Plus — 1 month",
    currency: "MMK",
    additionalField1: null,
    additionalField2: null,
    additionalField3: null,
    additionalField4: null,
    additionalField5: null,
    transactionId: "360",
    paymentRequestId: "360",
    requestTime: "2019-11-06T15:38:56",
    ...overrides,
  };
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
  fields.hashValue = computeWaveHmac(message, SECRET);
  return JSON.stringify(fields);
}

test("wave adapter: confirmed payment normalizes to SUCCEEDED", async () => {
  const { transport } = makeTransport({ status: 200, body: null });
  const provider = createWavePaymentProvider({ config: makeConfig(), transport, now: () => FIXED_NOW });

  const result = await provider.verifyCallback({ rawBody: signedCallback() });
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(result.providerReferenceId, "360");
  assert.equal(result.orderReferenceId, "subpurchase_abc");
  assert.equal(result.amountMmk, 29000);
  assert.equal(result.currency, "MMK");
  assert.equal(result.providerEventId, "360");
  assert.equal(result.verifiedAt.getTime(), FIXED_NOW.getTime());
});

test("wave adapter: timeout statuses normalize to TIMED_OUT, cancellation to CANCELED", async () => {
  const { transport } = makeTransport({ status: 200, body: null });
  const provider = createWavePaymentProvider({ config: makeConfig(), transport, now: () => FIXED_NOW });

  for (const status of ["TRANSACTION_TIMED_OUT", "SCHEDULER_TRANSACTION_TIMED_OUT"]) {
    const result = await provider.verifyCallback({ rawBody: signedCallback({ status }) });
    assert.equal(result.status, "TIMED_OUT", status);
  }
  const canceled = await provider.verifyCallback({ rawBody: signedCallback({ status: "PAYMENT_REQUEST_CANCELLED" }) });
  assert.equal(canceled.status, "CANCELED");
  const failed = await provider.verifyCallback({ rawBody: signedCallback({ status: "BILL_COLLECTION_FAILED" }) });
  assert.equal(failed.status, "FAILED");
  const pending = await provider.verifyCallback({ rawBody: signedCallback({ status: "INSUFFICIENT_BALANCE" }) });
  assert.equal(pending.status, "INSUFFICIENT_BALANCE");
});

test("wave adapter: unknown status is rejected safely", async () => {
  const { transport } = makeTransport({ status: 200, body: null });
  const provider = createWavePaymentProvider({ config: makeConfig(), transport, now: () => FIXED_NOW });
  await assert.rejects(
    () => provider.verifyCallback({ rawBody: signedCallback({ status: "SOMETHING_NEW" }) }),
    (e: unknown) => e instanceof PaymentProviderError && e.code === "unknown_status",
  );
});

test("wave adapter: tampered callback payload is rejected", async () => {
  const { transport } = makeTransport({ status: 200, body: null });
  const provider = createWavePaymentProvider({ config: makeConfig(), transport, now: () => FIXED_NOW });

  // Amount changed after signing → signature no longer matches.
  await assert.rejects(
    () => provider.verifyCallback({ rawBody: tamperedCallback({ amount: 1 }) }),
    (e: unknown) => e instanceof PaymentProviderError && e.code === "invalid_signature",
  );
  // Transaction identity changed after signing → rejected.
  await assert.rejects(
    () => provider.verifyCallback({ rawBody: tamperedCallback({ status: "PAYMENT_CONFIRMED", transactionId: "999" }) }),
    (e: unknown) => e instanceof PaymentProviderError && e.code === "invalid_signature",
  );
});

test("wave adapter: forged and malformed callbacks are rejected", async () => {
  const { transport } = makeTransport({ status: 200, body: null });
  const provider = createWavePaymentProvider({ config: makeConfig(), transport, now: () => FIXED_NOW });

  await assert.rejects(
    () => provider.verifyCallback({ rawBody: "not json" }),
    (e: unknown) => e instanceof PaymentProviderError && e.code === "malformed_callback",
  );
  await assert.rejects(
    () => provider.verifyCallback({ rawBody: JSON.stringify({ status: "PAYMENT_CONFIRMED" }) }),
    (e: unknown) => e instanceof PaymentProviderError && e.code === "malformed_callback",
  );
  // Valid shape + valid signature from a DIFFERENT merchant → mismatch.
  await assert.rejects(
    () => provider.verifyCallback({ rawBody: signedCallback({ merchantId: "othermerchant" }) }),
    (e: unknown) => e instanceof PaymentProviderError && (e.code === "merchant_mismatch" || e.code === "invalid_signature"),
  );
  // Missing orderId (binding key) → malformed.
  await assert.rejects(
    () => provider.verifyCallback({ rawBody: signedCallback({ orderId: null }) }),
    (e: unknown) => e instanceof PaymentProviderError && e.code === "malformed_callback",
  );
});

// ===========================================================================
// Configuration boundary
// ===========================================================================

test("config: missing credentials fail clearly with variable names only", () => {
  try {
    resolveWaveProviderConfig({});
    assert.fail("should have thrown");
  } catch (e) {
    assert.ok(e instanceof PaymentConfigError);
    assert.deepEqual(
      [...e.invalidVariables].sort(),
      [
        "PAYMENT_API_BASE_URL",
        "PAYMENT_MERCHANT_ID",
        "PAYMENT_MERCHANT_NAME",
        "PAYMENT_MERCHANT_SECRET",
        "PAYMENT_PROVIDER",
        "PAYMENT_ENVIRONMENT",
      ].sort(),
    );
    // No values leak — the environment was empty, and the message holds names only.
    assert.match(e.message, /PAYMENT_MERCHANT_SECRET/);
  }
});

test("config: invalid provider, environment, and URL fail safely", () => {
  const base = {
    PAYMENT_PROVIDER: "wavepay",
    PAYMENT_ENVIRONMENT: "test",
    PAYMENT_MERCHANT_ID: "m",
    PAYMENT_MERCHANT_NAME: "n",
    PAYMENT_MERCHANT_SECRET: SECRET,
    PAYMENT_API_BASE_URL: "https://testpayments.wavemoney.io:8107",
  };
  assert.throws(() => resolveWaveProviderConfig({ ...base, PAYMENT_PROVIDER: "stripe" }), PaymentConfigError);
  assert.throws(() => resolveWaveProviderConfig({ ...base, PAYMENT_ENVIRONMENT: "live" }), PaymentConfigError);
  assert.throws(() => resolveWaveProviderConfig({ ...base, PAYMENT_API_BASE_URL: "http://testpayments.wavemoney.io:8107" }), PaymentConfigError);
  assert.throws(() => resolveWaveProviderConfig({ ...base, PAYMENT_API_BASE_URL: "not-a-url" }), PaymentConfigError);
  assert.throws(() => resolveWaveProviderConfig({ ...base, PAYMENT_API_BASE_URL: "https://payments.wavemoney.io", PAYMENT_ENVIRONMENT: "test" }), PaymentConfigError);
  assert.throws(() => resolveWaveProviderConfig({ ...base, PAYMENT_API_BASE_URL: "https://testpayments.wavemoney.io:8107", PAYMENT_ENVIRONMENT: "production" }), PaymentConfigError);
});

test("config: no secret leakage and no NEXT_PUBLIC exposure", () => {
  const config = makeConfig();
  assert.equal(config.merchantSecret, SECRET, "secret stays in the server-only config object");
  const configSource = read("lib/payment/payment-config.ts");
  // No NEXT_PUBLIC_<NAME> variable is ever read (doc comment aside).
  assert.doesNotMatch(configSource, /NEXT_PUBLIC_[A-Z0-9_]+/);
  assert.doesNotMatch(configSource, /console\.(log|info|debug)/);
  const waveSource = read("lib/payment/wave-payment-provider.ts");
  assert.doesNotMatch(waveSource, /console\.(log|info|debug)/);
  // Error messages carry variable names, never secret values.
  try {
    resolveWaveProviderConfig({ PAYMENT_MERCHANT_SECRET: SECRET });
  } catch (e) {
    assert.ok(e instanceof PaymentConfigError);
    assert.doesNotMatch(e.message, new RegExp(SECRET));
  }
});

// ===========================================================================
// Provider isolation
// ===========================================================================

test("provider isolation: domain modules carry no provider payload shapes", () => {
  for (const path of ["lib/payment/payment-contract.ts", "lib/payment/payment-state.ts", "lib/payment/http-transport.ts"]) {
    const source = read(path);
    assert.doesNotMatch(source, /PAYMENT_CONFIRMED|merchantId|hashValue|msisdn|paymentRequestId|transactionId/i, `${path} is provider-neutral`);
    assert.doesNotMatch(source, /@prisma\/client|from "@\/lib\/prisma"/, `${path} has no Prisma dependency`);
    assert.doesNotMatch(source, /wavepay|Wave Money|wavemoney|\bWave\b/i, `${path} names no provider`);
  }
  const waveSource = read("lib/payment/wave-payment-provider.ts");
  assert.match(waveSource, /PAYMENT_CONFIRMED/);
  assert.match(waveSource, /merchant_reference_id/);
  assert.match(waveSource, /waveCallbackHashMessage/);
});

test("provider isolation: S7-A fulfillment boundary remains untouched", () => {
  const service = read("lib/subscription-purchase-service.ts");
  assert.match(service, /export async function fulfillVerifiedPurchase/);
  assert.match(service, /payment verification required/);
  assert.match(service, /purchase\.status !== "PENDING"/);
  assert.doesNotMatch(service, /export function createVerifiedPurchasePayment/);
  // S7-B.1 adds no fulfillment route.
  const status = read("app/api/subscription/purchases/[id]/route.ts");
  assert.doesNotMatch(status, /fulfillVerifiedPurchase|activateSubscription/);
});

test("package script and no network calls in the payment domain", () => {
  const pkg = read("package.json");
  assert.match(pkg, /"test:spark-s7b1"/);
  for (const path of [
    "lib/payment/payment-contract.ts",
    "lib/payment/payment-state.ts",
    "lib/payment/http-transport.ts",
    "lib/payment/wave-signature.ts",
    "lib/payment/payment-config.ts",
    "lib/payment/wave-payment-provider.ts",
  ]) {
    assert.doesNotMatch(read(path), /\bfetch\s*\(|axios|XMLHttpRequest|https?\.(get|request)\b/, `${path} performs no network I/O`);
  }
});
