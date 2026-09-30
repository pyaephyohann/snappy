/**
 * S8.5 — deployment hygiene & reachability preparation.
 *
 * Source/config-only checks: no provider credentials, no provider call, no
 * database access, no payment-state mutation. These guard that `.env.example`
 * documents the REAL resolver variables (names only, placeholders only), that
 * the documented production/test endpoint pairing and callback-origin behavior
 * match the code, that the canonical-origin ambiguity is recorded without
 * choosing a host, and that S8.3 readiness / S8.4 blocked semantics are
 * unchanged.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PaymentConfigError,
  resolveWaveProviderConfig,
} from "../lib/payment/payment-config";
import { getPaymentUrlConfig } from "../lib/payment/payment-urls";

const root = resolve(import.meta.dirname, "..");
// `.env.example` matches the `.env*` gitignore rule, so the ignore-aware file
// tooling skips it; read it straight from disk instead.
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const ENV_EXAMPLE_PATH = ".env.example";
const DOCS_PATH = "docs/spark-economy.md";
const READINESS_ROUTE_PATH = "app/api/admin/payments/readiness/route.ts";
const SMOKE_HARNESS_PATH = "scripts/spark-s8.4-smoke.ts";

/** The six required provider variables, as declared in payment-config.ts. */
const REQUIRED_CONFIG_VARS = [
  "PAYMENT_PROVIDER",
  "PAYMENT_ENVIRONMENT",
  "PAYMENT_MERCHANT_ID",
  "PAYMENT_MERCHANT_NAME",
  "PAYMENT_MERCHANT_SECRET",
  "PAYMENT_API_BASE_URL",
] as const;

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

test(".env.example documents every resolver variable with safe placeholders", () => {
  const example = read(ENV_EXAMPLE_PATH);
  for (const name of REQUIRED_CONFIG_VARS) {
    assert.match(example, new RegExp(`^${name}=`, "m"), `missing ${name}`);
  }
  // Optional callback-origin variable: documented, never a real value.
  assert.match(example, /^PAYMENT_CALLBACK_BASE_URL=/m);
  // The origin fallbacks are documented in context (no invented names).
  assert.match(example, /SNAPPY_PUBLIC_URL/);
  assert.match(example, /VERCEL_PROJECT_PRODUCTION_URL/);
});

test(".env.example contains no secret value and no NEXT_PUBLIC_ payment variable", () => {
  const example = read(ENV_EXAMPLE_PATH);

  // Every documented payment credential is empty; the only preset is the
  // non-secret provider selector.
  const documented = example
    .split("\n")
    .map((line) => line.match(/^(PAYMENT_[A-Z_]+)="([^"]*)"/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => ({ name: match[1], value: match[2] }));

  assert.ok(documented.length >= REQUIRED_CONFIG_VARS.length);
  for (const { name, value } of documented) {
    if (name === "PAYMENT_PROVIDER") assert.equal(value, "wavepay");
    else assert.equal(value, "", `${name} must not carry a real value`);
  }
  assert.equal(
    documented.find((entry) => entry.name === "PAYMENT_MERCHANT_SECRET")?.value,
    "",
  );
  // No client-visible payment variable may exist.
  assert.doesNotMatch(example, /NEXT_PUBLIC_PAYMENT/);
});

test("documented variable names match the resolver, and no name was invented", () => {
  const configSource = read("lib/payment/payment-config.ts");
  for (const name of REQUIRED_CONFIG_VARS) {
    assert.match(configSource, new RegExp(`\\b${name}\\b`), `${name} not in resolver`);
  }

  // The `.env.example` payment-name set equals the code's required set plus the
  // optional callback-origin variable — nothing extra.
  const example = read(ENV_EXAMPLE_PATH);
  const documentedNames = new Set(
    [...example.matchAll(/^(PAYMENT_[A-Z_]+)=/gm)].map((match) => match[1]),
  );
  const expectedNames = new Set<string>([
    ...REQUIRED_CONFIG_VARS,
    "PAYMENT_CALLBACK_BASE_URL",
  ]);
  assert.deepEqual([...documentedNames].sort(), [...expectedNames].sort());

  // Functional: the exact documented names resolve; dropping any fails loudly.
  const fullEnv = {
    PAYMENT_PROVIDER: "wavepay",
    PAYMENT_ENVIRONMENT: "test",
    PAYMENT_MERCHANT_ID: "unit-test-merchant",
    PAYMENT_MERCHANT_NAME: "Unit Test",
    PAYMENT_MERCHANT_SECRET: "unit-test-secret-not-real",
    PAYMENT_API_BASE_URL: "https://testpayments.wavemoney.io:8107",
  } as const;
  const resolved = resolveWaveProviderConfig(fullEnv);
  assert.equal(resolved.providerId, "wavepay");
  assert.equal(resolved.environment, "test");
  assert.throws(
    () => resolveWaveProviderConfig({ ...fullEnv, PAYMENT_MERCHANT_SECRET: undefined }),
    (error: unknown) => error instanceof PaymentConfigError,
  );
});

test("production/test endpoint pairing is documented and enforced by the resolver", () => {
  const docs = read(DOCS_PATH);
  assert.match(docs, /payments\.wavemoney\.io/);
  assert.match(docs, /testpayments\.wavemoney\.io:8107/);

  const base = {
    PAYMENT_PROVIDER: "wavepay",
    PAYMENT_MERCHANT_ID: "unit-test-merchant",
    PAYMENT_MERCHANT_NAME: "Unit Test",
    PAYMENT_MERCHANT_SECRET: "unit-test-secret-not-real",
  } as const;

  // Matching pairs resolve.
  assert.equal(
    resolveWaveProviderConfig({
      ...base,
      PAYMENT_ENVIRONMENT: "test",
      PAYMENT_API_BASE_URL: "https://testpayments.wavemoney.io:8107",
    }).environment,
    "test",
  );
  assert.equal(
    resolveWaveProviderConfig({
      ...base,
      PAYMENT_ENVIRONMENT: "production",
      PAYMENT_API_BASE_URL: "https://payments.wavemoney.io",
    }).environment,
    "production",
  );

  // Mismatched pairs and unknown hosts are rejected.
  for (const env of [
    { PAYMENT_ENVIRONMENT: "test", PAYMENT_API_BASE_URL: "https://payments.wavemoney.io" },
    {
      PAYMENT_ENVIRONMENT: "production",
      PAYMENT_API_BASE_URL: "https://testpayments.wavemoney.io:8107",
    },
    {
      PAYMENT_ENVIRONMENT: "production",
      PAYMENT_API_BASE_URL: "https://example.com",
    },
  ]) {
    assert.throws(
      () => resolveWaveProviderConfig({ ...base, ...env }),
      (error: unknown) => error instanceof PaymentConfigError,
    );
  }
});

test("callback-origin documentation matches the resolver's actual behavior", () => {
  const docs = read(DOCS_PATH);
  assert.match(docs, /PAYMENT_CALLBACK_BASE_URL/);
  assert.match(docs, /SNAPPY_PUBLIC_URL/);
  assert.match(docs, /\/api\/payments\/wave\/callback/);
  assert.match(docs, /\/subscription\/checkout\/return/);

  // Default: both callback and return derive from the public origin.
  const onlyPublic = withEnv(
    {
      SNAPPY_PUBLIC_URL: "https://snappy.example.com",
      PAYMENT_CALLBACK_BASE_URL: undefined,
      VERCEL_PROJECT_PRODUCTION_URL: undefined,
    },
    () => getPaymentUrlConfig(),
  );
  assert.ok(onlyPublic);
  assert.equal(
    onlyPublic.backendCallbackUrl,
    "https://snappy.example.com/api/payments/wave/callback",
  );
  assert.equal(
    onlyPublic.frontendReturnUrl,
    "https://snappy.example.com/subscription/checkout/return",
  );

  // Dedicated callback origin: only the callback origin changes.
  const split = withEnv(
    {
      SNAPPY_PUBLIC_URL: "https://snappy.example.com",
      PAYMENT_CALLBACK_BASE_URL: "https://payments-api.example.com",
      VERCEL_PROJECT_PRODUCTION_URL: undefined,
    },
    () => getPaymentUrlConfig(),
  );
  assert.ok(split);
  assert.equal(
    split.backendCallbackUrl,
    "https://payments-api.example.com/api/payments/wave/callback",
  );
  assert.equal(
    split.frontendReturnUrl,
    "https://snappy.example.com/subscription/checkout/return",
  );

  // No usable origin fails closed (payment init returns 503).
  assert.equal(
    withEnv(
      {
        SNAPPY_PUBLIC_URL: undefined,
        PAYMENT_CALLBACK_BASE_URL: undefined,
        VERCEL_PROJECT_PRODUCTION_URL: undefined,
      },
      () => getPaymentUrlConfig(),
    ),
    null,
  );
});

test("canonical-origin ambiguity is recorded without choosing a host", () => {
  const docs = read(DOCS_PATH);
  const section = docs.slice(docs.indexOf("## S8.5"));
  assert.match(section, /snapppy\.info/);
  assert.match(section, /www\.snapppy\.info/);
  assert.match(section, /UNRESOLVED/i);
  // Explicitly refuses to decide, so no silent drift into a chosen canonical.
  assert.match(section, /does\s+\*\*not\*\*\s+choose a canonical host/i);
});

test("S8.3 readiness semantics remain unchanged and are restated by S8.5", () => {
  const route = read(READINESS_ROUTE_PATH);
  assert.match(route, /requireAdminApi\(\)/);
  assert.match(route, /mode: "configuration-only"/);
  assert.doesNotMatch(route, /prisma|resolveWaveProviderConfig\([^)]*\bprisma/);

  const docs = read(DOCS_PATH);
  const section = docs.slice(docs.indexOf("## S8.5"));
  assert.match(section, /ready: true` from S8\.3 does NOT prove deployment reachability/i);
  assert.match(section, /sandbox payment/i);
});

test("S8.4 blocked behavior remains unchanged", () => {
  const docs = read(DOCS_PATH);
  assert.match(docs, /S8\.4 RESULT: BLOCKED — Wave sandbox unavailable/);
  // The harness still refuses production unconditionally.
  const harness = read(SMOKE_HARNESS_PATH);
  assert.match(harness, /REFUSED_PRODUCTION/);
});
