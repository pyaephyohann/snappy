/**
 * S8.2/S8.3 — payment readiness probe checks.
 *
 * Deterministic source/configuration tests only: no provider credentials, no
 * provider calls, no database access, and no payment-state mutation.
 *
 * S8.3 clarified the probe's semantics: `ready` means the payment
 * configuration is internally valid and the deployment configuration is ready
 * to be checked — never Wave merchant approval, credential validity,
 * deployment reachability, callback delivery, or a completed payment. The
 * semantic is guarded below so the wording cannot silently drift.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PaymentConfigError,
  resolveWaveProviderConfig,
} from "../lib/payment/payment-config";
import { getPaymentUrlConfig } from "../lib/payment/payment-urls";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const ROUTE_PATH = "app/api/admin/payments/readiness/route.ts";

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

test("readiness probe exists, is admin-gated, read-only, and server-only", () => {
  const route = read(ROUTE_PATH);
  // Admin session gate: never an unauthenticated recon surface.
  assert.match(route, /requireAdminApi\(\)/);
  assert.match(route, /adminErrorResponse\(/);
  // GET only — a diagnostic must not expose mutating verbs.
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(route, /"use client"/);
});

test("readiness probe has no side effects (no provider calls, no database)", () => {
  const route = read(ROUTE_PATH);
  assert.doesNotMatch(
    route,
    /getPaymentProvider|createWavePaymentProvider|FetchHttpTransport|postForm|verifyCallback/,
  );
  assert.doesNotMatch(
    route,
    /fulfillVerifiedPurchase|mintVerifiedPurchasePayment|prisma/,
  );
  assert.match(route, /mode: "configuration-only"/);
});

test("readiness probe never returns secrets, values, or variable names", () => {
  const route = read(ROUTE_PATH);
  assert.doesNotMatch(route, /merchantSecret|merchantId|merchantName|PAYMENT_MERCHANT/);
  // Configuration errors carry variable NAMES; those must stay server-side.
  assert.doesNotMatch(route, /invalidVariables/);
  // No exception serialization into the response body.
  assert.doesNotMatch(route, /message:\s*error\.message|error\.message\s*\}/);
  // Uncached, private responses.
  assert.match(route, /private, no-store/);
});

test("readiness probe reports the real callback contract and 503 when not ready", () => {
  const route = read(ROUTE_PATH);
  assert.match(route, /EXPECTED_CALLBACK_PATH = "\/api\/payments\/wave\/callback"/);
  assert.match(route, /EXPECTED_FRONTEND_RETURN_PATH = "\/subscription\/checkout\/return"/);
  assert.match(route, /ready \? 200 : 503/);

  // The advertised path must match the deployed signed-callback route.
  const callbackRoutePath = "app/api/payments/wave/callback/route.ts";
  assert.equal(existsSync(resolve(root, callbackRoutePath)), true);
  const callbackRoute = read(callbackRoutePath);
  assert.match(callbackRoute, /export async function POST/);
});

test("readiness semantics: `ready` claims configuration validity only", () => {
  const route = read(ROUTE_PATH);
  assert.match(route, /internally valid/i);
  assert.match(route, /does NOT mean/i);
  // Every non-implication must stay documented explicitly.
  for (const phrase of [
    /merchant approval/i,
    /credentials/i,
    /reachable/i,
    /callback delivery/i,
    /sandbox payment/i,
    /production/i,
  ]) {
    assert.match(route, phrase);
  }
  // The probe must not be described as operational approval anywhere.
  assert.doesNotMatch(route, /deployment cannot accept payments/i);
});

test("readiness probe's expected paths match what the resolvers actually produce", () => {
  const urls = withEnv(
    { SNAPPY_PUBLIC_URL: "https://snappy.example.com", PAYMENT_CALLBACK_BASE_URL: undefined },
    () => getPaymentUrlConfig(),
  );
  assert.ok(urls);
  assert.equal(urls.backendCallbackUrl, "https://snappy.example.com/api/payments/wave/callback");
  assert.equal(urls.frontendReturnUrl, "https://snappy.example.com/subscription/checkout/return");

  // The two states the probe reports on are genuinely reachable.
  assert.throws(
    () => resolveWaveProviderConfig({}),
    (error: unknown) => error instanceof PaymentConfigError,
  );
  const resolved = resolveWaveProviderConfig({
    PAYMENT_PROVIDER: "wavepay",
    PAYMENT_ENVIRONMENT: "test",
    PAYMENT_MERCHANT_ID: "unit-test-merchant",
    PAYMENT_MERCHANT_NAME: "Unit Test",
    PAYMENT_MERCHANT_SECRET: "unit-test-secret-not-real",
    PAYMENT_API_BASE_URL: "https://testpayments.wavemoney.io:8107",
  });
  assert.equal(resolved.providerId, "wavepay");
  assert.equal(resolved.environment, "test");
});
