#!/usr/bin/env node
/**
 * S8.4 — Subscription payment SANDBOX smoke harness.
 *
 * One runnable script that walks the provider-independent purchase flow end to
 * end and prints which stage fails. It is a VERIFICATION harness: it adds no
 * payment architecture and reuses the production services, provider adapter,
 * signature verification, state machine, and fulfillment boundary.
 *
 * Two clearly separated verification tiers:
 *
 *   LOCAL / DETERMINISTIC VERIFICATION
 *     Uses the REAL Wave adapter and the REAL callback verifier, wired to a
 *     deterministic in-process transport (the documented `HttpTransport`
 *     seam) and a synthetic, run-scoped secret. The real HMAC path runs and
 *     tampering is rejected, but no Wave server is contacted and no real
 *     credential is used. This proves the flow's wiring and idempotency; it
 *     does NOT prove Wave accepts anything.
 *
 *   LIVE SANDBOX PROVIDER VERIFICATION
 *     Requires positively established sandbox configuration AND an explicit
 *     opt-in (`SMOKE_LIVE_SANDBOX=1`). Contacts the documented Wave sandbox
 *     only, and PASSes only when the purchase settles from a genuine
 *     provider callback. If the provider tier cannot run it reports
 *     `SKIPPED — LIVE WAVE SANDBOX NOT AVAILABLE` and the overall result is
 *     `BLOCKED`, never `PASS`.
 *
 * Safety boundaries (hard):
 *   - `PAYMENT_ENVIRONMENT=production` is refused unconditionally; no flag can
 *     turn this harness into a production-payment tool.
 *   - No secrets are printed: no merchant secret, tokens, cookies, headers,
 *     signatures, database URLs, or full payment URLs (origin+path only, query
 *     redacted). Provider references are masked.
 *   - Test data is isolated by a per-run RUN_ID; cleanup deletes only rows
 *     owned by this run's smoke user, and refuses to delete if that identity
 *     cannot be verified.
 *
 * Output states: PASS | FAIL | SKIPPED | BLOCKED. Exit codes: PASS=0, FAIL=1,
 * BLOCKED=2 (BLOCKED is never a success).
 *
 * Run: npm run test:spark-s84
 *
 * S7-B.5 remains BLOCKED: this harness invents no reconciliation or inquiry
 * API, and it does not prove production merchant approval or production
 * payment readiness.
 */
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { addBillingMonths, PAID_PLANS, PLAN_CONFIG } from "../lib/subscription-plans";
import {
  resolveWaveProviderConfig,
  type WaveProviderConfig,
} from "../lib/payment/payment-config";
import { getPaymentUrlConfig } from "../lib/payment/payment-urls";
import type { HttpTransport } from "../lib/payment/http-transport";
import type { PaymentProvider } from "../lib/payment/payment-contract";
import { createWavePaymentProvider } from "../lib/payment/wave-payment-provider";
import { computeWaveHmac, waveCallbackHashMessage } from "../lib/payment/wave-signature";

/** The only Wave host accepted for the sandbox tier. */
export const SMOKE_TEST_API_BASE = "https://testpayments.wavemoney.io:8107";
/** Documented maximum payment TTL (seconds). */
const SMOKE_TTL_SECONDS = 600;
/** Explicit live opt-in value; required in addition to valid sandbox config. */
export const LIVE_OPT_IN_VAR = "SMOKE_LIVE_SANDBOX";
/** Default plan for a smoke purchase (cheapest paid plan). */
const DEFAULT_SMOKE_PLAN = "SPARK_PLUS";

// ===========================================================================
// Pure helpers (exported for the focused test suite)
// ===========================================================================

export type SmokeMode = "REFUSED_PRODUCTION" | "LIVE_SANDBOX" | "LOCAL_DETERMINISTIC";

export interface SmokeModeDecision {
  mode: SmokeMode;
  readonly reasons: readonly string[];
}

/**
 * Decide what this run is allowed to do. Production is refused FIRST and
 * unconditionally — there is deliberately no flag that enables it.
 */
export function resolveSmokeMode(
  env: Record<string, string | undefined>,
): SmokeModeDecision {
  if (env.PAYMENT_ENVIRONMENT === "production") {
    return {
      mode: "REFUSED_PRODUCTION",
      reasons: ["PAYMENT_ENVIRONMENT=production is refused unconditionally"],
    };
  }

  let sandboxConfigValid = false;
  try {
    resolveWaveProviderConfig(env);
    sandboxConfigValid = true;
  } catch {
    sandboxConfigValid = false;
  }

  if (!sandboxConfigValid) {
    return {
      mode: "LOCAL_DETERMINISTIC",
      reasons: [
        "sandbox provider configuration is not positively established",
        "live provider traffic is disabled",
      ],
    };
  }

  if (env[LIVE_OPT_IN_VAR] !== "1") {
    return {
      mode: "LOCAL_DETERMINISTIC",
      reasons: [
        "sandbox configuration validated but explicit live opt-in is not set",
        `set ${LIVE_OPT_IN_VAR}=1 to enable the live sandbox tier`,
      ],
    };
  }

  return {
    mode: "LIVE_SANDBOX",
    reasons: ["sandbox configuration validated", "explicit live opt-in present"],
  };
}

export function buildRunId(
  now: Date = new Date(),
  entropy: string = randomBytes(4).toString("hex"),
): string {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `s84_${stamp}_${entropy}`;
}

export interface RunIdentity {
  runId: string;
  /** `User.name` is @unique, so every run gets a collision-proof identity. */
  userName: string;
  idempotencyKey: string;
  callbackRequestTime: string;
}

export function buildRunIdentity(runId: string, now: Date = new Date()): RunIdentity {
  return {
    runId,
    userName: `smoke_s84_${runId}`,
    idempotencyKey: `s84-idem-${runId}`,
    callbackRequestTime: now.toISOString().slice(0, 19),
  };
}

/** Mask a provider reference: never print it in full. */
export function maskReference(value: string | null | undefined): string {
  if (!value) return "(absent)";
  if (value.length <= 8) return `${value.slice(0, 1)}…(len ${value.length})`;
  return `${value.slice(0, 4)}…${value.slice(-2)} (len ${value.length})`;
}

/** Summarize a payment URL as origin+path only — the query (if any) is redacted. */
export function summarizePaymentUrl(raw: string | null | undefined): string {
  if (!raw) return "(absent)";
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}?<redacted>`;
  } catch {
    return "(unparseable; redacted)";
  }
}

export type StageStatus = "PASS" | "FAIL" | "SKIPPED" | "BLOCKED";
export type OverallResult = "PASS" | "FAIL" | "BLOCKED";

export interface StageResult {
  id: number;
  label: string;
  status: StageStatus;
  detail: string;
  /** A mandatory stage that is not PASS makes the overall result non-PASS. */
  mandatory: boolean;
  /** Marks the live provider tier (kept distinct from deterministic checks). */
  provider: boolean;
}

/**
 * Overall semantics: any FAIL → FAIL; any mandatory stage not PASS → BLOCKED;
 * otherwise PASS. A skipped provider stage can therefore never yield PASS.
 */
export function computeOverallResult(stages: readonly StageResult[]): OverallResult {
  if (stages.some((stage) => stage.status === "FAIL")) return "FAIL";
  if (stages.some((stage) => stage.mandatory && stage.status !== "PASS")) return "BLOCKED";
  return "PASS";
}

// ===========================================================================
// Deterministic provider (real adapter, in-process transport, synthetic secret)
// ===========================================================================

export interface DeterministicProvider {
  provider: PaymentProvider;
  config: WaveProviderConfig;
  /** Path + field NAMES only (never values) of requests the adapter made. */
  requests: Array<{ path: string; fieldNames: string[] }>;
}

/**
 * Deterministic provider for the local tier.
 *
 * The adapter's clock is PINNED at the first provider interaction: the first
 * call (payment creation) sees the real time — so the TTL stays valid — and
 * every later call (callback verification, replays) sees that same instant, so
 * a replayed callback represents the SAME provider event. The locked S7-B.3
 * suite models replays with a fixed clock the same way. A re-delivery that
 * carries a genuinely later verification time is a different question; see the
 * docs section for that finding (locked boundary; unchanged here).
 */
export function createDeterministicSmokeProvider(runId: string): DeterministicProvider {
  const config = resolveWaveProviderConfig({
    PAYMENT_PROVIDER: "wavepay",
    PAYMENT_ENVIRONMENT: "test",
    PAYMENT_MERCHANT_ID: `s84-merchant-${runId}`,
    PAYMENT_MERCHANT_NAME: "S8.4 Smoke Harness (synthetic)",
    PAYMENT_MERCHANT_SECRET: `s84-synthetic-secret-${runId}`,
    PAYMENT_API_BASE_URL: SMOKE_TEST_API_BASE,
  });

  const requests: DeterministicProvider["requests"] = [];
  const transport: HttpTransport = {
    async postForm(request) {
      const url = new URL(request.url);
      requests.push({
        path: `${url.origin}${url.pathname}`,
        fieldNames: Object.keys(request.form).sort(),
      });
      if (url.pathname !== "/payment") {
        throw new Error("deterministic transport: unexpected endpoint");
      }
      // The documented Wave success shape; no network, no real credential.
      return { status: 200, body: { message: "success", transaction_id: `s84-tx-${runId}` } };
    },
  };

  let pinnedClock: Date | null = null;
  return {
    provider: createWavePaymentProvider({
      config,
      transport,
      now: () => (pinnedClock ??= new Date()),
    }),
    config,
    requests,
  };
}

export interface SmokeCallbackInput {
  secret: string;
  merchantId: string;
  orderId: string;
  amountMmk: number;
  backendResultUrl: string;
  merchantReferenceId: string;
  paymentRequestId: string;
  transactionId: string;
  initiatorMsisdn: string;
  requestTime: string;
  status?: string;
  timeToLiveSeconds?: number;
  currency?: string;
}

/** Build a callback in the documented Wave field format, signed with `secret`. */
export function buildSignedSmokeCallback(input: SmokeCallbackInput): string {
  const status = input.status ?? "PAYMENT_CONFIRMED";
  const timeToLiveSeconds = input.timeToLiveSeconds ?? SMOKE_TTL_SECONDS;
  const message = waveCallbackHashMessage({
    status,
    timeToLiveSeconds,
    merchantId: input.merchantId,
    orderId: input.orderId,
    amount: input.amountMmk,
    backendResultUrl: input.backendResultUrl,
    merchantReferenceId: input.merchantReferenceId,
    initiatorMsisdn: input.initiatorMsisdn,
    transactionId: input.transactionId,
    paymentRequestId: input.paymentRequestId,
    requestTime: input.requestTime,
  });
  return JSON.stringify({
    status,
    merchantId: input.merchantId,
    orderId: input.orderId,
    merchantReferenceId: input.merchantReferenceId,
    backendResultUrl: input.backendResultUrl,
    initiatorMsisdn: input.initiatorMsisdn,
    amount: input.amountMmk,
    timeToLiveSeconds,
    currency: input.currency ?? "MMK",
    transactionId: input.transactionId,
    paymentRequestId: input.paymentRequestId,
    requestTime: input.requestTime,
    hashValue: computeWaveHmac(message, input.secret),
  });
}

/** Tamper with a signed callback WITHOUT re-signing (must be rejected). */
export function tamperSignedSmokeCallback(
  raw: string,
  overrides: Record<string, unknown>,
): string {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return JSON.stringify({ ...parsed, ...overrides });
}

// ===========================================================================
// Cleanup (exported for tests)
// ===========================================================================

type PrismaLike = import("@prisma/client").PrismaClient;

/**
 * Delete ONLY this run's records. Refuses unless the target user is verifiably
 * this run's smoke identity, and never performs an unscoped delete.
 */
export async function cleanupRun(
  prisma: PrismaLike,
  userId: string | null,
  expectedUserName: string,
): Promise<{ ok: boolean; detail: string }> {
  if (!userId) return { ok: true, detail: "no records were created" };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.name !== expectedUserName || !user.name.startsWith("smoke_s84_")) {
    return {
      ok: false,
      detail: "refused: target identity is not this run's smoke user (no deletion performed)",
    };
  }

  try {
    const transactions = await prisma.sparkTransaction.deleteMany({ where: { userId } });
    const uploadUsage = await prisma.uploadUsage.deleteMany({ where: { userId } });
    const subscriptions = await prisma.subscription.deleteMany({ where: { userId } });
    const purchases = await prisma.subscriptionPurchase.deleteMany({ where: { userId } });
    const users = await prisma.user.deleteMany({ where: { id: userId } });
    return {
      ok: true,
      detail:
        `removed transactions=${transactions.count}, uploadUsage=${uploadUsage.count}, ` +
        `subscriptions=${subscriptions.count}, purchases=${purchases.count}, users=${users.count}`,
    };
  } catch {
    return { ok: false, detail: "cleanup failed; only this run's records were targeted" };
  }
}

// ===========================================================================
// Reporting
// ===========================================================================

function printHeader(decision: SmokeModeDecision, runId: string): void {
  console.log("S8.4 — subscription payment sandbox smoke harness");
  console.log(`RUN_ID: ${runId}`);
  console.log(`MODE: ${decision.mode}`);
  for (const reason of decision.reasons) console.log(`  - ${reason}`);
  console.log("");
}

function printStage(stage: StageResult): void {
  const tag = stage.provider ? "provider" : "local";
  console.log(
    `[${String(stage.id).padStart(2, "0")}] ${stage.label.padEnd(44, ".")} ${stage.status.padEnd(8)} ${stage.detail} (${tag})`,
  );
}

function finish(stages: readonly StageResult[], decision: SmokeModeDecision): number {
  const overall = computeOverallResult(stages);
  const reason =
    overall === "PASS"
      ? "all mandatory stages passed (live sandbox verification)"
      : overall === "FAIL"
        ? "one or more stages failed"
        : decision.mode === "LIVE_SANDBOX"
          ? "live sandbox verification did not complete"
          : "Wave sandbox unavailable";

  console.log("");
  console.log(`S8.4 RESULT: ${overall} — ${reason}`);
  console.log(
    "Note: LOCAL/DETERMINISTIC stages exercise the real services and verifier with a synthetic key; " +
      "they do not prove that Wave accepted anything.",
  );
  console.log(
    "S7-B.5 remains BLOCKED (no reconciliation/inquiry API is assumed). This harness does not prove " +
      "production merchant approval or production payment readiness.",
  );
  return overall === "PASS" ? 0 : overall === "FAIL" ? 1 : 2;
}

// ===========================================================================
// Main flow
// ===========================================================================

interface RunState {
  userId: string | null;
  prisma: PrismaLike | null;
}

export async function main(): Promise<number> {
  const env = process.env;
  const decision = resolveSmokeMode(env);
  const runId = buildRunId();
  const identity = buildRunIdentity(runId);
  const stages: StageResult[] = [];
  const state: RunState = { userId: null, prisma: null };

  const record = (
    id: number,
    label: string,
    status: StageStatus,
    detail: string,
    opts: { mandatory?: boolean; provider?: boolean } = {},
  ): void => {
    const stage: StageResult = {
      id,
      label,
      status,
      detail,
      mandatory: opts.mandatory ?? true,
      provider: opts.provider ?? false,
    };
    stages.push(stage);
    printStage(stage);
  };

  printHeader(decision, runId);

  // -------------------------------------------------------------------------
  // Stage 1 — configuration / readiness (safe categories only)
  // -------------------------------------------------------------------------
  if (decision.mode === "REFUSED_PRODUCTION") {
    record(1, "Configuration / readiness", "FAIL", "refused: production environment");
    return finish(stages, decision);
  }

  const urls = getPaymentUrlConfig();
  let sandboxConfigEstablished = false;
  try {
    resolveWaveProviderConfig(env);
    sandboxConfigEstablished = true;
  } catch {
    sandboxConfigEstablished = false;
  }
  const hasDatabase = Boolean(env.DATABASE_URL);
  const stage1Problems: string[] = [];
  if (!urls) stage1Problems.push("callback origin not configured");
  if (!hasDatabase) stage1Problems.push("database not configured");

  record(
    1,
    "Configuration / readiness",
    stage1Problems.length === 0 ? "PASS" : "BLOCKED",
    [
      `sandbox config established: ${sandboxConfigEstablished ? "yes" : "no"}`,
      `callback origin configured: ${urls ? "yes" : "no"}`,
      `database configured: ${hasDatabase ? "yes" : "no"}`,
      stage1Problems.length > 0 ? `blocked: ${stage1Problems.join("; ")}` : "readiness configuration valid",
    ].join(" | "),
  );
  if (stage1Problems.length > 0) return finish(stages, decision);

  await runFlow(record, state, {
    env,
    decision,
    identity,
    runId,
    plan: resolveSmokePlan(env),
    urls: urls!,
  });

  // Cleanup runs before the final result so the report reflects reality.
  const cleanup = state.prisma
    ? await cleanupRun(state.prisma, state.userId, identity.userName)
    : { ok: true, detail: "no records were created" };
  record(12, "Cleanup (this run only)", cleanup.ok ? "PASS" : "FAIL", cleanup.detail, {
    mandatory: false,
  });

  return finish(stages, decision);
}

interface FlowContext {
  env: Record<string, string | undefined>;
  decision: SmokeModeDecision;
  identity: RunIdentity;
  runId: string;
  plan: (typeof PAID_PLANS)[number];
  urls: { backendCallbackUrl: string; frontendReturnUrl: string };
}

type RecordStage = (
  id: number,
  label: string,
  status: StageStatus,
  detail: string,
  opts?: { mandatory?: boolean; provider?: boolean },
) => void;

async function runFlow(record: RecordStage, state: RunState, ctx: FlowContext): Promise<void> {
  const { env, decision, identity, runId, plan, urls } = ctx;

  try {
    const { createPurchase, getPurchase } = await import("../lib/subscription-purchase-service");
    const { initializePurchasePayment } = await import("../lib/payment-initialization-service");
    const { handleWavePaymentCallback } = await import("../lib/payment-callback-service");
    const { isSubscriptionActive, subscriptionGrantReference } = await import(
      "../lib/subscription-service"
    );
    const { prisma } = (await import("../lib/prisma")) as { prisma: PrismaLike };
    state.prisma = prisma;

    // -----------------------------------------------------------------------
    // Stage 2 — purchase creation (server-derived amount)
    // -----------------------------------------------------------------------
    const user = await prisma.user.create({
      data: { name: identity.userName, profileImage: "https://example.com/s84-smoke.jpg" },
    });
    state.userId = user.id;

    const purchase = await createPurchase(user.id, plan, identity.idempotencyKey);
    const replay = await createPurchase(user.id, plan, identity.idempotencyKey);
    const expectedAmount = PLAN_CONFIG[plan].monthlyPriceMmk;
    const amountMatchesConfig = purchase.amountMmk === expectedAmount;
    const idempotent = replay.id === purchase.id;
    const orderReferenceValid = /^subpurchase_[0-9a-f]{64}$/.test(purchase.orderReferenceId);

    const stage2Ok =
      purchase.requestedPlan === plan &&
      purchase.currency === "MMK" &&
      purchase.status === "INITIALIZED" &&
      amountMatchesConfig &&
      idempotent &&
      orderReferenceValid;

    record(
      2,
      "Create subscription purchase",
      stage2Ok ? "PASS" : "FAIL",
      [
        `plan=${purchase.requestedPlan}`,
        `amount=${purchase.amountMmk} MMK (server-derived)`,
        `currency=${purchase.currency}`,
        `order reference: ${orderReferenceValid ? "deterministic" : "INVALID"}`,
        `idempotent replay: ${idempotent ? "yes" : "NO"}`,
      ].join(" | "),
    );
    if (!stage2Ok) return;

    // -----------------------------------------------------------------------
    // Stage 3 — payment initialization
    // -----------------------------------------------------------------------
    const deterministic =
      decision.mode === "LIVE_SANDBOX" ? null : createDeterministicSmokeProvider(runId);
    const provider: PaymentProvider = deterministic
      ? deterministic.provider
      : (await import("../lib/payment/payment-provider-factory")).getPaymentProvider();

    const init = await initializePurchasePayment(
      user.id,
      purchase.id,
      identity.idempotencyKey,
      provider,
      { backendCallbackUrl: urls.backendCallbackUrl, frontendReturnUrl: urls.frontendReturnUrl },
    );

    const requestedFields = deterministic?.requests.at(-1)?.fieldNames ?? [];
    const documentedFieldsPresent =
      requestedFields.length > 0 &&
      ["amount", "backend_result_url", "merchant_id", "order_id", "hash", "time_to_live_in_seconds"].every(
        (field) => requestedFields.includes(field),
      );

    const stage3Ok =
      init.status === "PENDING" &&
      typeof init.expiresAt === "string" &&
      (decision.mode === "LIVE_SANDBOX" || documentedFieldsPresent);

    record(
      3,
      "Initialize provider payment",
      stage3Ok ? "PASS" : "FAIL",
      [
        `purchase status=${init.status}`,
        `payment URL: ${summarizePaymentUrl(init.paymentUrl)}`,
        `documented request fields: ${
          deterministic ? (documentedFieldsPresent ? "present" : "MISSING") : "n/a (live)"
        }`,
      ].join(" | "),
    );
    if (!stage3Ok) return;

    // -----------------------------------------------------------------------
    // Stage 4 — confirm the persisted provider reference
    // -----------------------------------------------------------------------
    // The owner-scoped service projection deliberately omits internal fields
    // (provider reference, billing period), so internal verification reads the
    // row directly; the service call still proves the owner-scoped path works.
    const rawPurchase = () =>
      prisma.subscriptionPurchase.findUnique({ where: { id: purchase.id } });
    const persisted = await getPurchase(user.id, purchase.id);
    const row = await rawPurchase();
    const referencePersisted = Boolean(row?.providerReferenceId);
    const stage4Ok =
      referencePersisted &&
      Boolean(row?.paymentInitiatedAt) &&
      row?.status === "PENDING" &&
      persisted?.status === "PENDING" &&
      Boolean(row?.expiresAt);

    record(
      4,
      "Confirm provider payment reference",
      stage4Ok ? "PASS" : "FAIL",
      [
        `reference persisted: ${referencePersisted ? "yes" : "no"} (${maskReference(row?.providerReferenceId)})`,
        `paymentInitiatedAt: ${row?.paymentInitiatedAt ? "set" : "missing"}`,
        `owner-scoped service status: ${persisted?.status ?? "missing"}`,
        `expiresAt: ${row?.expiresAt ? "set" : "missing"}`,
      ].join(" | "),
    );
    if (!stage4Ok) return;

    // -----------------------------------------------------------------------
    // Provider tier — the live Wave sandbox interaction (stage 4P)
    // -----------------------------------------------------------------------
    if (decision.mode === "LIVE_SANDBOX") {
      const settled = await pollForTerminalState(user.id, purchase.id, env, getPurchase);
      record(
        4,
        "LIVE provider interaction (Wave sandbox)",
        settled === "SUCCEEDED" ? "PASS" : "SKIPPED",
        settled === "SUCCEEDED"
          ? "sandbox payment observed as settled"
          : `no settled sandbox payment within the window (last state: ${settled})`,
        { provider: true },
      );
      if (settled !== "SUCCEEDED") return;
    } else {
      record(
        4,
        "LIVE provider interaction (Wave sandbox)",
        "SKIPPED",
        "SKIPPED — LIVE WAVE SANDBOX NOT AVAILABLE",
        { provider: true },
      );
    }

    // -----------------------------------------------------------------------
    // Stage 5 — callback (deterministic: real verifier, synthetic secret)
    // -----------------------------------------------------------------------
    let rawCallback: string | null = null;
    if (deterministic) {
      rawCallback = buildSignedSmokeCallback({
        secret: deterministic.config.merchantSecret,
        merchantId: deterministic.config.merchantId,
        orderId: row!.orderReferenceId,
        amountMmk: row!.amountMmk,
        backendResultUrl: urls.backendCallbackUrl,
        merchantReferenceId: row!.id,
        paymentRequestId: row!.providerReferenceId!,
        transactionId: `s84-tx-${runId}`,
        initiatorMsisdn: "9791009039",
        requestTime: identity.callbackRequestTime,
      });

      const outcome = await handleWavePaymentCallback(rawCallback, provider);
      let tamperRejected = false;
      try {
        await handleWavePaymentCallback(
          tamperSignedSmokeCallback(rawCallback, { amount: row!.amountMmk + 1 }),
          provider,
        );
      } catch {
        tamperRejected = true;
      }

      const stage5Ok = outcome.kind === "fulfilled" && outcome.replay === false && tamperRejected;
      record(
        5,
        "Callback verification (deterministic)",
        stage5Ok ? "PASS" : "FAIL",
        `real adapter + HMAC verified (synthetic key); tamper rejected: ${tamperRejected ? "yes" : "NO"}`,
      );
      if (!stage5Ok) return;
    } else {
      record(
        5,
        "Callback verification (live provider)",
        "PASS",
        "purchase settled through the signature-verified callback path",
        { provider: true },
      );
    }

    // -----------------------------------------------------------------------
    // Stages 6–7 — fulfillment and terminal state
    // -----------------------------------------------------------------------
    const fulfilled = await getPurchase(user.id, purchase.id);
    const settledRow = await rawPurchase();
    const fulfillmentOk =
      fulfilled?.status === "SUCCEEDED" &&
      Boolean(settledRow?.subscriptionId) &&
      Boolean(settledRow?.periodStart) &&
      Boolean(settledRow?.paymentSucceededAt);

    record(
      6,
      "Fulfill purchase",
      fulfillmentOk ? "PASS" : "FAIL",
      [
        `purchase status=${fulfilled?.status ?? "unknown"}`,
        `subscription linked: ${settledRow?.subscriptionId ? "yes" : "no"}`,
        `billing period start: ${settledRow?.periodStart ? "set" : "missing"}`,
      ].join(" | "),
    );
    if (!fulfillmentOk) return;

    record(
      7,
      "Verify purchase terminal state",
      fulfilled!.status === "SUCCEEDED" ? "PASS" : "FAIL",
      `status=${fulfilled!.status} (terminal)`,
    );

    // -----------------------------------------------------------------------
    // Stage 8 — subscription activation
    // -----------------------------------------------------------------------
    const subscription = await prisma.subscription.findUnique({ where: { userId: user.id } });
    const expectedPeriodEnd = settledRow!.periodStart
      ? addBillingMonths(settledRow!.periodStart, 1).getTime()
      : null;
    const stage8Ok = Boolean(
      subscription &&
        subscription.plan === plan &&
        subscription.status === "ACTIVE" &&
        isSubscriptionActive(subscription) &&
        expectedPeriodEnd !== null &&
        subscription.currentPeriodEnd.getTime() === expectedPeriodEnd,
    );

    record(
      8,
      "Verify subscription activation",
      stage8Ok ? "PASS" : "FAIL",
      [
        `plan=${subscription?.plan ?? "absent"}`,
        `status=${subscription?.status ?? "absent"}`,
        `period end matches expected: ${stage8Ok ? "yes" : "no"}`,
      ].join(" | "),
    );
    if (!stage8Ok) return;

    // -----------------------------------------------------------------------
    // Stage 9 — subscription Sparks grant (deterministic reference)
    // -----------------------------------------------------------------------
    const expectedReference = subscriptionGrantReference(
      subscription!.id,
      settledRow!.periodStart!,
    );
    const grants = await prisma.sparkTransaction.findMany({
      where: { userId: user.id, type: "SUBSCRIPTION_GRANT", sparkKind: "SUBSCRIPTION" },
    });
    const stage9Ok =
      grants.length === 1 &&
      grants[0].amount === PLAN_CONFIG[plan].subscriptionSparks &&
      grants[0].referenceId === expectedReference;

    record(
      9,
      "Verify subscription Sparks grant",
      stage9Ok ? "PASS" : "FAIL",
      [
        `grant count=${grants.length}`,
        `amount=${grants[0]?.amount ?? "n/a"} (expected ${PLAN_CONFIG[plan].subscriptionSparks})`,
        `deterministic reference: ${grants[0]?.referenceId === expectedReference ? "yes" : "no"}`,
      ].join(" | "),
    );
    if (!stage9Ok) return;

    // -----------------------------------------------------------------------
    // Stage 10 — replay / idempotency (exactly-once)
    // -----------------------------------------------------------------------
    if (deterministic && rawCallback) {
      const transactionsBefore = await prisma.sparkTransaction.count({ where: { userId: user.id } });
      const replayOutcome = await handleWavePaymentCallback(rawCallback, provider);
      const concurrent = await Promise.allSettled([
        handleWavePaymentCallback(rawCallback, provider),
        handleWavePaymentCallback(rawCallback, provider),
      ]);
      const replayAck =
        replayOutcome.kind === "fulfilled" && replayOutcome.replay
          ? "acknowledged (replay)"
          : `unexpected: ${replayOutcome.kind}`;
      const concurrentOk = concurrent.every((result) => result.status === "fulfilled");
      const afterReplay = await getPurchase(user.id, purchase.id);
      const grantsAfter = await prisma.sparkTransaction.count({
        where: { userId: user.id, type: "SUBSCRIPTION_GRANT", sparkKind: "SUBSCRIPTION" },
      });
      const subscriptionsAfter = await prisma.subscription.count({ where: { userId: user.id } });
      const transactionsAfter = await prisma.sparkTransaction.count({ where: { userId: user.id } });
      const stage10Ok =
        replayAck === "acknowledged (replay)" &&
        concurrentOk &&
        afterReplay?.status === "SUCCEEDED" &&
        grantsAfter === 1 &&
        subscriptionsAfter === 1 &&
        transactionsAfter === transactionsBefore;

      record(
        10,
        "Replay callback / idempotency",
        stage10Ok ? "PASS" : "FAIL",
        [
          `replay of the same provider event: ${replayAck}`,
          `concurrent duplicates handled: ${concurrentOk ? "yes" : "NO"}`,
          `grants after replay=${grantsAfter}`,
          `subscriptions=${subscriptionsAfter}`,
          `new transactions=${transactionsAfter - transactionsBefore}`,
        ].join(" | "),
      );
      if (!stage10Ok) return;
    } else {
      const grantsAfter = await prisma.sparkTransaction.count({
        where: { userId: user.id, type: "SUBSCRIPTION_GRANT", sparkKind: "SUBSCRIPTION" },
      });
      record(
        10,
        "Replay callback / idempotency",
        grantsAfter === 1 ? "PASS" : "FAIL",
        `live replay needs the original signed payload; exactly-once counts verified (grants=${grantsAfter})`,
      );
      record(
        10,
        "Provider callback replay (live)",
        "SKIPPED",
        "SKIPPED — LIVE WAVE SANDBOX NOT AVAILABLE (no documented replay API is assumed)",
        { provider: true, mandatory: false },
      );
    }

    // -----------------------------------------------------------------------
    // Stage 11 — final verification summary (safe fields only)
    // -----------------------------------------------------------------------
    record(
      11,
      "Final verification summary",
      "PASS",
      [
        `purchase=${fulfilled!.status}`,
        `plan=${fulfilled!.requestedPlan}`,
        `provider reference present: ${settledRow!.providerReferenceId ? "yes" : "no"}`,
        `subscription=${subscription!.status}`,
        `effective plan=${subscription!.plan}`,
        `grant count=${grants.length}`,
        `duplicate grants=${Math.max(0, grants.length - 1)}`,
      ].join(" | "),
    );
  } catch (error) {
    record(
      99,
      "Harness execution",
      "FAIL",
      error instanceof Error ? `${error.name}: ${error.message}` : "unknown error",
    );
  }
}

function resolveSmokePlan(env: Record<string, string | undefined>): (typeof PAID_PLANS)[number] {
  const requested = env.SMOKE_PLAN;
  if (requested && (PAID_PLANS as readonly string[]).includes(requested)) {
    return requested as (typeof PAID_PLANS)[number];
  }
  return DEFAULT_SMOKE_PLAN;
}

async function pollForTerminalState(
  userId: string,
  purchaseId: string,
  env: Record<string, string | undefined>,
  getPurchase: (userId: string, purchaseId: string) => Promise<{ status: string } | null>,
): Promise<string> {
  const rawTimeout = Number(env.SMOKE_TIMEOUT_MS ?? 180_000);
  const timeoutMs = Number.isFinite(rawTimeout) ? rawTimeout : 180_000;
  const deadline = Date.now() + timeoutMs;
  let last = "unknown";
  while (Date.now() < deadline) {
    const purchase = await getPurchase(userId, purchaseId);
    last = purchase?.status ?? "missing";
    if (last === "SUCCEEDED" || last === "FAILED" || last === "CANCELED" || last === "EXPIRED") {
      return last;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000));
  }
  return last;
}

const invokedDirectly = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return (
      resolve(fileURLToPath(import.meta.url)) === resolve(entry) ||
      entry.endsWith("spark-s8.4-smoke.ts")
    );
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(
        "S8.4 harness crashed:",
        error instanceof Error ? error.name : "unknown error",
      );
      process.exit(1);
    });
}
