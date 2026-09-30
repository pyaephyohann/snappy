/**
 * S7-C — payment production-readiness regression checks.
 *
 * These are deterministic source/configuration tests only: no provider
 * credentials, provider calls, or database mutation are involved.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveWaveProviderConfig, PaymentConfigError } from "../lib/payment/payment-config";
import { getPaymentUrlConfig } from "../lib/payment/payment-urls";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

function withEnv<T>(values: Record<string, string | undefined>, run: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(values)) {
    previous.set(key, process.env[key]);
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key]!;
  }
  try {
    return run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const providerEnv = {
  PAYMENT_PROVIDER: "wavepay",
  PAYMENT_ENVIRONMENT: "test",
  PAYMENT_MERCHANT_ID: "unit-test-merchant",
  PAYMENT_MERCHANT_NAME: "Unit Test",
  PAYMENT_MERCHANT_SECRET: "unit-test-secret-not-real",
  PAYMENT_API_BASE_URL: "https://testpayments.wavemoney.io:8107",
};

test("config: required settings fail closed without leaking values", () => {
  assert.throws(
    () => resolveWaveProviderConfig({}),
    (error: unknown) => {
      assert.ok(error instanceof PaymentConfigError);
      assert.ok(error.invalidVariables.includes("PAYMENT_MERCHANT_SECRET"));
      assert.doesNotMatch(error.message, /unit-test-secret-not-real/);
      return true;
    },
  );
  assert.throws(
    () => resolveWaveProviderConfig({
      ...providerEnv,
      PAYMENT_API_BASE_URL: "http://testpayments.wavemoney.io:8107",
    }),
    (error: unknown) => error instanceof PaymentConfigError,
  );
});

test("config: payment environment must match only the documented Wave test and production endpoints", () => {
  assert.equal(resolveWaveProviderConfig(providerEnv).environment, "test");
  assert.throws(
    () => resolveWaveProviderConfig({ ...providerEnv, PAYMENT_API_BASE_URL: "https://testpayments.wavemoney.io" }),
    (error: unknown) => error instanceof PaymentConfigError,
  );
  assert.throws(
    () => resolveWaveProviderConfig({ ...providerEnv, PAYMENT_API_BASE_URL: "https://testpayments.wavemoney.io:8443" }),
    (error: unknown) => error instanceof PaymentConfigError,
  );
  assert.throws(
    () => resolveWaveProviderConfig({ ...providerEnv, PAYMENT_API_BASE_URL: "https://user:pass@testpayments.wavemoney.io:8107" }),
    (error: unknown) => error instanceof PaymentConfigError,
  );
  assert.throws(
    () => resolveWaveProviderConfig({ ...providerEnv, PAYMENT_ENVIRONMENT: "production" }),
    (error: unknown) => error instanceof PaymentConfigError,
  );
  assert.throws(
    () => resolveWaveProviderConfig({ ...providerEnv, PAYMENT_API_BASE_URL: "https://unknown.example", PAYMENT_ENVIRONMENT: "test" }),
    (error: unknown) => error instanceof PaymentConfigError,
  );
  assert.equal(
    resolveWaveProviderConfig({
      ...providerEnv,
      PAYMENT_ENVIRONMENT: "production",
      PAYMENT_API_BASE_URL: "https://payments.wavemoney.io",
    }).apiBaseUrl,
    "https://payments.wavemoney.io",
  );
  assert.throws(
    () => resolveWaveProviderConfig({
      ...providerEnv,
      PAYMENT_API_BASE_URL: "https://payments.wavemoney.io",
    }),
    (error: unknown) => error instanceof PaymentConfigError,
  );
  assert.throws(
    () => resolveWaveProviderConfig({
      ...providerEnv,
      PAYMENT_ENVIRONMENT: "production",
      PAYMENT_API_BASE_URL: "https://payments.wavemoney.io:8443",
    }),
    (error: unknown) => error instanceof PaymentConfigError,
  );
  assert.throws(
    () => resolveWaveProviderConfig({ ...providerEnv, PAYMENT_API_BASE_URL: "https://x.example/path" }),
    (error: unknown) => error instanceof PaymentConfigError,
  );
});

test("callback URLs are HTTPS server-configured and target the actual signed callback route", () => {
  withEnv({
    SNAPPY_PUBLIC_URL: "https://snappy.example",
    VERCEL_PROJECT_PRODUCTION_URL: undefined,
    PAYMENT_CALLBACK_BASE_URL: "https://payments-api.example",
  }, () => {
    assert.deepEqual(getPaymentUrlConfig(), {
      backendCallbackUrl: "https://payments-api.example/api/payments/wave/callback",
      frontendReturnUrl: "https://snappy.example/subscription/checkout/return",
    });
  });
  withEnv({
    SNAPPY_PUBLIC_URL: undefined,
    VERCEL_PROJECT_PRODUCTION_URL: "snappy.example",
    PAYMENT_CALLBACK_BASE_URL: undefined,
  }, () => {
    assert.deepEqual(getPaymentUrlConfig(), {
      backendCallbackUrl: "https://snappy.example/api/payments/wave/callback",
      frontendReturnUrl: "https://snappy.example/subscription/checkout/return",
    });
  });
});

test("provider and URL origin errors are classified without exception details", () => {
  const init = read("app/api/subscription/purchases/[id]/payment/route.ts");
  assert.match(init, /Payment configuration unavailable/);
  assert.match(init, /Payment configuration check failed \(internal error\)/);
  assert.doesNotMatch(init, /console\.error\([^\n]*\$\{error/);
  assert.doesNotMatch(init, /console\.error\([^\n]*error\.message/);
});

test("invalid explicit public/callback origins fail closed instead of falling back", () => {
  withEnv({
    SNAPPY_PUBLIC_URL: "http://snappy.example",
    VERCEL_PROJECT_PRODUCTION_URL: "valid.example",
    PAYMENT_CALLBACK_BASE_URL: undefined,
  }, () => assert.equal(getPaymentUrlConfig(), null));
  withEnv({
    SNAPPY_PUBLIC_URL: "  ",
    VERCEL_PROJECT_PRODUCTION_URL: "valid.example",
    PAYMENT_CALLBACK_BASE_URL: undefined,
  }, () => assert.equal(getPaymentUrlConfig(), null));
  withEnv({
    SNAPPY_PUBLIC_URL: "https://snappy.example",
    VERCEL_PROJECT_PRODUCTION_URL: undefined,
    PAYMENT_CALLBACK_BASE_URL: "http://callback.example",
  }, () => assert.equal(getPaymentUrlConfig(), null));
  withEnv({
    SNAPPY_PUBLIC_URL: "https://snappy.example",
    VERCEL_PROJECT_PRODUCTION_URL: undefined,
    PAYMENT_CALLBACK_BASE_URL: " ",
  }, () => assert.equal(getPaymentUrlConfig(), null));
  withEnv({
    SNAPPY_PUBLIC_URL: "https://snappy.example/unsafe/path",
    VERCEL_PROJECT_PRODUCTION_URL: undefined,
    PAYMENT_CALLBACK_BASE_URL: undefined,
  }, () => assert.equal(getPaymentUrlConfig(), null));
  withEnv({
    SNAPPY_PUBLIC_URL: "https://snappy.example",
    VERCEL_PROJECT_PRODUCTION_URL: undefined,
    PAYMENT_CALLBACK_BASE_URL: "https://callback.example/unsafe/path",
  }, () => assert.equal(getPaymentUrlConfig(), null));
});

test("payment APIs log safe error categories only, never raw exception objects", () => {
  const create = read("app/api/subscription/purchases/route.ts");
  const init = read("app/api/subscription/purchases/[id]/payment/route.ts");
  const status = read("app/api/subscription/purchases/[id]/route.ts");
  for (const source of [create, init, status]) {
    assert.doesNotMatch(source, /console\.(?:log|error|info|debug)\([^\n]*,\s*error\s*\)/);
    assert.match(source, /console\.error\(["'][^"']+(?:internal error|unavailable)[^"']*["']\)/);
  }
  for (const source of [create, init]) {
    assert.match(source, /isSocialMutationRateLimited\(`subscription-/);
    assert.match(source, /status: 429/);
  }
  assert.match(init, /PaymentConfigError/);
  assert.match(init, /Payment configuration unavailable/);
  assert.match(init, /Payment configuration check failed \(internal error\)/);
  assert.match(init, /Payment initialization failed \(internal error\)/);
  assert.match(create, /Subscription purchase creation failed \(internal error\)/);
  assert.match(status, /Subscription purchase status lookup failed \(internal error\)/);
});

test("callback hardening remains: POST, bounded raw body, verified handler, no sensitive logs", () => {
  const route = read("app/api/payments/wave/callback/route.ts");
  assert.match(route, /export async function POST/);
  assert.match(route, /MAX_CALLBACK_BODY_BYTES = 64 \* 1024/);
  assert.match(route, /request\.arrayBuffer\(\)/);
  assert.match(route, /application\/json/);
  assert.match(route, /handleWavePaymentCallback\(\s*rawBody/);
  assert.doesNotMatch(route, /console\.(log|info|debug)\([^\n]*(rawBody|hashValue|signature)/i);
  const signature = read("lib/payment/wave-signature.ts");
  assert.match(signature, /timingSafeEqual/);
  const adapter = read("lib/payment/wave-payment-provider.ts");
  assert.match(adapter, /unknown_status/);
  assert.match(adapter, /merchant_mismatch/);
});

test("purchase/status APIs are owner-scoped, private/no-store, and status reads stay provider-free", () => {
  const create = read("app/api/subscription/purchases/route.ts");
  const statusRoute = read("app/api/subscription/purchases/[id]/route.ts");
  const initRoute = read("app/api/subscription/purchases/[id]/payment/route.ts");
  const service = read("lib/subscription-purchase-service.ts");
  for (const source of [create, statusRoute, initRoute]) {
    assert.match(source, /Cache-Control/);
    assert.match(source, /private, no-store/);
  }
  assert.match(create, /requireAuthenticatedAppUser/);
  assert.match(statusRoute, /requireAuthenticatedAppUser/);
  assert.match(statusRoute, /getPurchase\(user\.id, id\)/);
  assert.match(service, /where: \{ id: purchaseId, userId \}/);
  assert.doesNotMatch(statusRoute, /getPaymentProvider|fetch\(|initializePurchasePayment/);
  assert.doesNotMatch(service.slice(service.indexOf("const safePurchaseSelect"), service.indexOf("function isUniqueViolation")), /providerReferenceId|idempotencyKeyHash/);
});

test("provider transport is HTTPS-only, bounded, and does not log provider material", () => {
  const transport = read("lib/payment/fetch-http-transport.ts");
  assert.match(transport, /url\.protocol !== "https:"/);
  assert.match(transport, /AbortSignal\.timeout/);
  assert.match(transport, /redirect: "error"/);
  assert.doesNotMatch(transport, /console\.(log|error|info|debug)/);
  const callback = read("app/api/payments/wave/callback/route.ts");
  assert.doesNotMatch(callback, /console\.(log|info|debug)\([^\n]*(rawBody|hashValue|signature)/i);
  const create = read("app/api/subscription/purchases/route.ts");
  const init = read("app/api/subscription/purchases/[id]/payment/route.ts");
  const status = read("app/api/subscription/purchases/[id]/route.ts");
  assert.doesNotMatch(create + init + status, /console\.error\([^\n]*,\s*error\s*\)/);
});

test("client payment code contains no server secrets, signatures, fulfillment or reconciliation", () => {
  for (const path of [
    "lib/purchase-status-client.ts",
    "hooks/usePurchaseStatus.ts",
    "components/sparks/SparkPlanPurchaseFlow.tsx",
    "app/subscription/checkout/return/page.tsx",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /PAYMENT_MERCHANT_SECRET|merchantSecret|hashValue|createHmac|fulfillVerifiedPurchase|reconcilePayment/i, path);
  }
});
