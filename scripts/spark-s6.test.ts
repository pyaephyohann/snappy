/**
 * S6 — Spark Plan UI Foundation tests.
 *
 * Source-level only: S6 adds no server behavior, so there is nothing to
 * verify against a live database that the S4/S5 suites do not already cover.
 *
 * Coverage: the plan section consumes the authoritative PLAN_CONFIG (no
 * duplicated configuration, no hard-coded price digits), all four plans and
 * their configuration-driven features render, the current plan comes
 * verbatim from the server usage summary, no client-side economy/status/
 * expiration math exists, no API call or subscription route is introduced
 * in the section itself, the shared profile integration holds for
 * Web/PWA/Telegram, S5/protected files remain untouched, and documentation
 * covers S6 while the locked S5 slice stays clean of prices and providers.
 *
 * S7-B.4 note: the plan cards now carry a purchase affordance, so the two
 * assertions S7-B.4 supersedes (the section's display-only payment
 * boundary and useSparkUsage.ts's untouched status) were re-scoped below —
 * the same minimal-adjustment convention used for the S7-B.2 route count
 * in scripts/spark-s7a.test.ts.
 *
 * Run: npm run test:spark-s6
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, join } from "node:path";
import {
  DEFAULT_PLAN,
  PAID_PLANS,
  PLAN_CONFIG,
} from "../lib/subscription-plans";

const root = resolve(import.meta.dirname, "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function listFilesRecursively(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFilesRecursively(full));
    else files.push(full);
  }
  return files;
}

const section = read("components/sparks/SparkPlanSection.tsx");
const profile = read("components/profile/ProfilePageClient.tsx");

/** Locked S5 payment-boundary regex (mirrors scripts/spark-s5.test.ts). */
const PAYMENT_BOUNDARY =
  /checkout|purchase|KPay|AYA Pay|UAB Pay|Stripe|payment webhook|Spark pack/i;

/** Literal price digits that must never appear in S6 UI or post-S5 docs. */
const PRICE_DIGITS = /(?:29,?000|59,?000|99,?000)/;
const PROVIDERS = /KPay|AYA Pay|UAB Pay|Stripe/i;

// ===========================================================================
// Plan configuration
// ===========================================================================

test("plan configuration stays authoritative: the section consumes PLAN_CONFIG", () => {
  assert.match(
    section,
    /from "@\/lib\/subscription-plans"/,
    "imports the shared authoritative module",
  );
  assert.match(section, /\bPLAN_CONFIG\b/);
  assert.match(section, /\bPAID_PLANS\b/);
  assert.match(section, /\bDEFAULT_PLAN\b/);

  // No second configuration source: no local plan table, no re-declared
  // config properties, and no hard-coded price digits anywhere.
  assert.doesNotMatch(section, /interface PlanConfig/);
  assert.doesNotMatch(section, /monthlyPriceMmk\s*:/);
  assert.doesNotMatch(section, /subscriptionSparks\s*:/);
  assert.doesNotMatch(section, /freeUploadsPerDay\s*:/);
  assert.doesNotMatch(section, PRICE_DIGITS);

  // The module itself is untouched and still the single source of truth.
  assert.equal(Object.keys(PLAN_CONFIG).length, 4);
  assert.equal(DEFAULT_PLAN, "FREE");
  assert.deepEqual([...PAID_PLANS], ["SPARK_PLUS", "SPARK_PRO", "SPARK_ULTRA"]);
});

// ===========================================================================
// Plan coverage + features
// ===========================================================================

test("all four plans render in a fixed comparison order", () => {
  assert.match(
    section,
    /PLAN_ORDER: SubscriptionPlan\[\] = \[DEFAULT_PLAN, \.\.\.PAID_PLANS\]/,
    "Free first, then the three paid plans from PAID_PLANS",
  );
  assert.match(section, /PLAN_ORDER\.map\(/);

  // Display labels exist for every plan key.
  for (const label of ["Free", "Spark Plus", "Spark Pro", "Spark Ultra"]) {
    assert.ok(
      section.includes(`"${label}"`),
      `plan label missing: ${label}`,
    );
  }
  for (const plan of Object.keys(PLAN_CONFIG)) {
    assert.ok(
      ["FREE", "SPARK_PLUS", "SPARK_PRO", "SPARK_ULTRA"].includes(plan),
      `unexpected plan key: ${plan}`,
    );
  }

  // Every configured plan is reachable through PLAN_ORDER's two sources.
  assert.equal(PLAN_CONFIG[DEFAULT_PLAN].monthlyPriceMmk, 0);
  for (const plan of PAID_PLANS) {
    assert.ok(PLAN_CONFIG[plan], `missing config for ${plan}`);
  }
});

test("plan features render from PlanConfig fields via Intl.NumberFormat", () => {
  assert.match(section, /PLAN_CONFIG\[plan\]/);
  assert.match(section, /config\.monthlyPriceMmk/);
  assert.match(section, /config\.subscriptionSparks/);
  assert.match(section, /config\.freeUploadsPerDay/);
  assert.match(section, /config\.extraUploadCost/);
  assert.match(section, /config\.captionEditCost/);
  assert.match(section, /Intl\.NumberFormat/);
  assert.match(section, /priceFormatter\.format\(config\.monthlyPriceMmk\)/);
});

// ===========================================================================
// Current plan + server authority
// ===========================================================================

test("current plan is driven by useSparkUsage() / usage.plan", () => {
  assert.match(section, /useSparkUsage\(\)/);
  assert.match(section, /currentPlan=\{usage\.plan\}/);
  assert.match(section, /Your plan/);

  // Never derived from anything else the client could hold.
  assert.doesNotMatch(section, /localStorage|sessionStorage|window\./);
});

test("no client-side economy math, status, or expiration calculation", () => {
  assert.doesNotMatch(
    section,
    /usage\.(?:balance|earnedSparks|subscriptionSparks|freeUploadsUsed|freeUploadsRemaining|dailyEarnedSparks)\s*[-+*/]/,
  );
  assert.doesNotMatch(section, /\bcanAfford/);
  assert.doesNotMatch(
    section,
    /new Date|Date\.now|getTime\(\)|expiresAt|isSubscriptionActive|resolveEffectivePlan/,
  );
  assert.doesNotMatch(section, /subscriptionStatus\s*(?:===|!==)/);
  assert.doesNotMatch(section, /\bstatus\s*(?:===|!==)/);
  // Server-only modules are never imported into the client component.
  assert.doesNotMatch(
    section,
    /from "@\/lib\/(?:subscription-service|spark-service)"/,
  );
});

// ===========================================================================
// Mutation safety
// ===========================================================================

test("S6 makes no API call and S7-A routes do not add a client fulfillment path", () => {
  // The section itself issues no requests and defines no HTTP mutation.
  assert.doesNotMatch(section, /\bfetch\s*\(|axios/);
  assert.doesNotMatch(section, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);

  // Only safe S7-A route surfaces exist, and no client fulfillment endpoint.
  const purchaseRoute = read("app/api/subscription/purchases/route.ts");
  const statusRoute = read("app/api/subscription/purchases/[id]/route.ts");
  const cancelRoute = read("app/api/subscription/cancel/route.ts");
  for (const route of [purchaseRoute, statusRoute, cancelRoute]) {
    assert.match(route, /requireAuthenticatedAppUser/);
    assert.doesNotMatch(route, /activateSubscription|fulfillVerifiedPurchase|paymentSucceededAt/);
  }
  const fulfillmentRoute = resolve(
    root,
    "app",
    "api",
    "subscription",
    "purchases",
    "[id]",
    "fulfill",
    "route.ts",
  );
  assert.equal(existsSync(fulfillmentRoute), false);

  const sparkRoutes = listFilesRecursively(resolve(root, "app", "api", "sparks")).filter(
    (file) => file.endsWith("route.ts"),
  );
  assert.equal(sparkRoutes.length, 1);
  assert.ok(sparkRoutes[0].endsWith("/sparks/usage/route.ts"));
});

test("S6 introduces no subscription lifecycle behavior in the UI", () => {
  for (const file of [
    "components/sparks/SparkPlanSection.tsx",
    "components/profile/ProfilePageClient.tsx",
  ]) {
    const body = read(file);
    assert.doesNotMatch(
      body,
      /activateSubscription|cancelSubscription|expireDueSubscriptions|upgrade|downgrade/i,
      `no lifecycle mutation wording in ${file}`,
    );
  }
});

// ===========================================================================
// Payment safety
// ===========================================================================

test("payment safety: the S7-B.4 affordance leaks no provider or price data into the Spark UI", () => {
  // S7-B.4 supersedes the S6 display-only snapshot for SparkPlanSection
  // (the plan cards now carry a purchase affordance). The S6 guarantees
  // that remain: the shared profile stays free of payment content, and the
  // Spark UI surface carries no provider names and no hard-coded prices.
  assert.doesNotMatch(profile, PAYMENT_BOUNDARY);
  assert.doesNotMatch(section, PROVIDERS);
  assert.doesNotMatch(section, PRICE_DIGITS);
  const flow = read("components/sparks/SparkPlanPurchaseFlow.tsx");
  assert.doesNotMatch(flow, PROVIDERS);
  assert.doesNotMatch(flow, PRICE_DIGITS);
  const statusClient = read("lib/purchase-status-client.ts");
  assert.doesNotMatch(statusClient, PROVIDERS);
  assert.doesNotMatch(statusClient, PRICE_DIGITS);

  // The unrelated profile-photo payment feature stays isolated.
  assert.doesNotMatch(
    section,
    /components\/payment|profile\/payment|premium-profile-photo-payment|images\/payments/,
  );
  assert.doesNotMatch(
    flow,
    /components\/payment|profile\/payment|premium-profile-photo-payment|images\/payments/,
  );
  assert.doesNotMatch(profile, /\/profile\/payment/);
});

// ===========================================================================
// Integration
// ===========================================================================

test("profile renders SparkBalanceCard followed by SparkPlanSection; Telegram keeps the shared profile", () => {
  assert.match(profile, /import SparkBalanceCard/);
  assert.match(profile, /<SparkBalanceCard \/>/);
  assert.match(profile, /import SparkPlanSection/);
  assert.match(profile, /<SparkPlanSection \/>/);

  const cardIndex = profile.indexOf("<SparkBalanceCard");
  const planIndex = profile.indexOf("<SparkPlanSection");
  assert.ok(cardIndex >= 0 && planIndex >= 0);
  assert.ok(
    cardIndex < planIndex,
    "the plan section sits directly beneath the S5 Spark card",
  );

  // Existing profile contract stays intact.
  assert.match(profile, /SnapGallery/);
  assert.match(profile, /canEditCaptions/);
  assert.match(profile, /TelegramConnectButton/);

  const telegramProfile = read("components/telegram/TelegramMiniAppProfile.tsx");
  assert.match(telegramProfile, /ProfilePageClient/);
  assert.match(telegramProfile, /homeHref/);
});

test("loading and error states never fabricate current-plan values", () => {
  assert.match(section, /Skeleton/);
  assert.match(section, /role="status"/);
  assert.match(section, /role="alert"/);
  // On fetch failure the static authoritative configuration still renders,
  // but no current plan is marked.
  assert.match(section, /currentPlan=\{null\}/);
});

// ===========================================================================
// S5 + protected-file integrity
// ===========================================================================

test("SparkBalanceCard and protected economy files are unchanged in the working tree", () => {
  const protectedPaths = [
    "components/sparks/SparkBalanceCard.tsx",
    "components/snaps/SparkUsageIndicator.tsx",
    "components/snaps/SnapCreateComposerModal.tsx",
    // S7-B.4: hooks/useSparkUsage.ts gains only the standard
    // snappy:spark-usage-updated refresh listener (mirroring the
    // NOTIFICATIONS_UPDATED_EVENT pattern) so every consumer re-fetches
    // server-backed data after a confirmed purchase; its contract is
    // asserted below instead of a zero-diff check.
    "lib/spark-usage.ts",
    "lib/subscription-plans.ts",
    // D3 re-scope (same convention as S7-B.4): components/snaps/SnapViewer.tsx
    // gains the shared server-authorized download flow and lib/spark-service.ts
    // gains only the flat SPARK_DOWNLOAD_COST + SNAP_DOWNLOAD case inside the
    // existing atomicSpendSparks primitive. Their Spark contracts are asserted
    // below instead of a zero-diff check; every other protected file stays
    // untouched.
  ];
  for (const path of protectedPaths) {
    const status = execSync(
      `git status --porcelain -- "${path}"`,
      { cwd: root, encoding: "utf8" },
    ).trim();
    assert.equal(status, "", `protected file must be untouched: ${path}`);
  }

  // S5 card still renders its server-authoritative contract.
  const card = read("components/sparks/SparkBalanceCard.tsx");
  assert.match(card, /useSparkUsage/);
  assert.match(card, /usage\.subscriptionStatus/);
  assert.match(card, /usage\.subscriptionPeriodEnd/);

  // useSparkUsage keeps its S5 contract and adds only the shared refresh
  // event listener (S7-B.4) used to re-fetch server-backed data.
  const usageHook = read("hooks/useSparkUsage.ts");
  assert.match(usageHook, /export function useSparkUsage/);
  assert.match(usageHook, /applyUsage/);
  assert.match(usageHook, /SPARK_USAGE_UPDATED_EVENT = "snappy:spark-usage-updated"/);
  assert.match(usageHook, /addEventListener\(SPARK_USAGE_UPDATED_EVENT/);

  // D3: SnapViewer keeps its caption-edit Spark contract while the download
  // flow moves to the shared server-authorized hook.
  const viewer = read("components/snaps/SnapViewer.tsx");
  assert.match(viewer, /useSparkUsage/);
  assert.match(viewer, /Edit caption for \{usage\.captionEditCost\} Sparks/);
  assert.match(viewer, /Save for \{usage\.captionEditCost\} Sparks/);
  assert.match(viewer, /useSnapDownload/);

  // D3: spark-service keeps the locked economy constants, the summary
  // projection, and row-locked spending; downloads add one flat cost and one
  // enum case without a second ledger or balance mechanism.
  const service = read("lib/spark-service.ts");
  assert.match(service, /export const SPARK_PER_UPLOAD_REWARD = 1;/);
  assert.match(service, /export async function getSparkUsageSummary/);
  assert.match(service, /subscriptionSparks:/);
  assert.match(service, /earnedSparks:/);
  assert.match(service, /subscriptionPeriodEnd/);
  assert.match(service, /FOR UPDATE/);
  assert.match(service, /export const SPARK_DOWNLOAD_COST = 1;/);
  assert.doesNotMatch(service, /localStorage|points/i);
});

// ===========================================================================
// Package script + documentation
// ===========================================================================

test("package.json exposes the S6 test script", () => {
  const pkg = JSON.parse(read("package.json")) as {
    scripts: Record<string, string>;
  };
  assert.ok(pkg.scripts["test:spark-s6"], "test:spark-s6 script missing");
});

test("documentation covers S6, keeps the S5 slice clean, and preserves S1–S5", () => {
  const docs = read("docs/spark-economy.md");
  assert.match(docs, /## S6 — Spark Plan UI Foundation/);

  const s6 = docs.slice(docs.indexOf("## S6 — Spark Plan UI Foundation"));
  assert.match(s6, /PLAN_CONFIG/);
  assert.match(s6, /SparkPlanSection/);
  assert.match(s6, /usage\.plan/);
  assert.match(s6, /display-only|Display-only/);
  assert.match(s6, /ProfilePageClient/);
  assert.match(s6, /future update/i);
  assert.match(s6, /S7/);
  // No literal prices, no payment providers, no claim of an active purchase.
  assert.doesNotMatch(s6, PRICE_DIGITS);
  assert.doesNotMatch(s6, PROVIDERS);

  // Locked S5 constraint: the slice from ## S5 to EOF (which now includes
  // the S6 section) must stay free of prices and providers.
  const s5 = docs.slice(docs.indexOf("## S5 — Spark UI Foundation"));
  assert.doesNotMatch(s5, PRICE_DIGITS);
  assert.doesNotMatch(s5, PROVIDERS);
  assert.match(s5, /S7/);

  // S1–S5 sections remain present and were not rewritten away.
  assert.match(docs, /## Terminology/);
  assert.match(docs, /## S2 — Snap Integration/);
  assert.match(docs, /## S3 — Caption Editing/);
  assert.match(docs, /## S4 — Subscription Foundation/);
  assert.match(docs, /## S5 — Spark UI Foundation/);
});
