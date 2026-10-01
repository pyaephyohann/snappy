/**
 * Sparks visibility regression tests —
 * "Show Sparks in navigation and Profile".
 *
 * Covers:
 * - the navigation Spark pill renders the existing server-authoritative
 *   balance (`useSparkUsage` → GET /api/sparks/usage) and never calculates it
 * - the pill and the profile Sparks card render the balance at any value,
 *   including 0
 * - the profile Sparks card keeps its S5 contract (server values only,
 *   loading/error conventions, no client-side economy math)
 * - existing navigation behavior (camera button, active states, profile
 *   navigation) is preserved
 * - Sparks terminology only — never "points"
 *
 * Run: node --env-file-if-exists=.env.local --import tsx --test scripts/spark-visibility.test.ts
 */

import "./test-db-guard";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PrismaClient } from "@prisma/client";

const hasDb = Boolean(process.env.DATABASE_URL);
const SKIP = !hasDb ? "DATABASE_URL not set" : false;

const root = resolve(import.meta.dirname, "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

let prisma: PrismaClient | null = null;
const testUserIds: string[] = [];

async function db(): Promise<PrismaClient> {
  if (!prisma) {
    const { PrismaClient: PrismaClientCtor } = await import("@prisma/client");
    prisma = new PrismaClientCtor();
  }
  return prisma;
}

async function createTestUser(namePrefix: string): Promise<string> {
  const client = await db();
  const user = await client.user.create({
    data: {
      name: `${namePrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      profileImage: "https://example.com/avatar.jpg",
    },
  });
  testUserIds.push(user.id);
  return user.id;
}

/** Seed Earned Sparks via the ledger (existing test convention). */
async function seedEarnedSparks(userId: string, amount: number) {
  const client = await db();
  return client.sparkTransaction.create({
    data: {
      userId,
      amount,
      type: "ADMIN_ADJUSTMENT",
      source: "ADMIN",
      sparkKind: "EARNED",
      referenceType: "spark-visibility-test",
      referenceId: `sv-seed-${userId}-${Date.now()}`,
    },
  });
}

before(async () => {
  if (!hasDb) return;
  const client = await db();
  await client.user.deleteMany({
    where: { name: { startsWith: "spark_visibility_" } },
  });
});

after(async () => {
  if (!prisma) return;
  for (const userId of testUserIds) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

// ===========================================================================
// Source-level wiring (always run)
// ===========================================================================

test("navigation pill renders the server-authoritative Spark balance", () => {
  const pill = read("components/sparks/SparkBalancePill.tsx");

  // Existing server-authoritative source — no second API, no local math.
  assert.match(pill, /useSparkUsage/);
  assert.match(pill, /\{usage\.balance\}/);
  assert.doesNotMatch(pill, /usage\.balance\s*[-+*/]/);
  assert.doesNotMatch(pill, /localStorage|sessionStorage/);
  // No Spark economy constants leak into client display code.
  assert.doesNotMatch(
    pill,
    /SPARK_PER_UPLOAD_REWARD|SPARK_DOWNLOAD_COST|EXTRA_UPLOAD_COST_SPARKS|PLAN_CONFIG/,
  );

  // A balance of 0 must still render: nothing may gate rendering on the value.
  assert.doesNotMatch(pill, /usage\.balance\s*(?:[><]|===|!==|\|\||\?)/);
  assert.doesNotMatch(pill, /balance\s*>\s*0/);

  // While loading/unavailable the pill hides instead of guessing a balance.
  assert.match(pill, /if \(!usage\) \{[\s\S]{0,40}return null;/);

  // Terminology + accessibility + existing-profile click behavior.
  assert.match(pill, /aria-label=\{`Sparks: \$\{usage\.balance\}/);
  assert.match(pill, /href=\{href\}/);
  assert.match(pill, /href = "\/profile"/);
  assert.doesNotMatch(pill, /\b(?:points?|coins?|XP|gems?)\b/i);
});

test("Navbar shows the Spark pill without disturbing existing navigation", () => {
  const navbar = read("components/layout/Navbar.tsx");
  assert.match(navbar, /import SparkBalancePill/);
  assert.match(navbar, /<SparkBalancePill \/>/);

  // Existing navbar contract stays intact.
  assert.match(navbar, /NavbarDesktopFriendSearch/);
  assert.match(navbar, /href: "\/profile"/);
  assert.doesNotMatch(navbar, /href: "\/search"/);
  assert.match(navbar, /aria-label="Go to profile"/);
  assert.match(navbar, /aria-label="Open chats"/);
});

test("mobile bottom navigation is untouched: camera, active state, safe-area preserved", () => {
  const bottomNav = read("components/mobile/BottomNav.tsx");
  assert.match(bottomNav, /aria-label="Create a snap with camera"/);
  assert.match(bottomNav, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(bottomNav, /safe-area/);

  const telegramNav = read("components/telegram/TelegramBottomNav.tsx");
  assert.match(telegramNav, /aria-label="Create a snap with camera"/);
});

test("profile Sparks card leads with the server-reported balance and keeps its S5 contract", () => {
  const card = read("components/sparks/SparkBalanceCard.tsx");

  // Hero balance rendered exactly as the server reports it — including 0.
  assert.match(card, /usage\.balance/);
  assert.doesNotMatch(card, /usage\.balance\s*(?:[><]|===|!==|\|\||\?)/);
  assert.doesNotMatch(card, /balance\s*>\s*0/);

  // Server-authoritative values and S5 conventions stay intact.
  assert.match(card, /useSparkUsage/);
  assert.match(card, /usage\.earnedSparks/);
  assert.match(card, /usage\.subscriptionSparks/);
  assert.match(card, /usage\.plan/);
  assert.match(card, /usage\.subscriptionStatus/);
  assert.match(card, /usage\.subscriptionPeriodEnd \?/);
  assert.match(card, /Skeleton/);
  assert.match(card, /role="alert"/);

  // No client-side economy math or costs.
  assert.doesNotMatch(card, /usage\.(?:balance|earnedSparks|subscriptionSparks)\s*[-+*/]/);
  assert.doesNotMatch(card, /\bcanAfford/);
  assert.doesNotMatch(card, /\bextraUploadCost\b/);
  assert.doesNotMatch(card, /\bcaptionEditCost\b/);
  assert.doesNotMatch(card, /\b(?:points?|coins?|XP|gems?)\b/i);
});

test("profile hierarchy keeps the Sparks card followed by Spark plans", () => {
  const profile = read("components/profile/ProfilePageClient.tsx");
  const cardIndex = profile.indexOf("<SparkBalanceCard />");
  const plansIndex = profile.indexOf("<SparkPlanSection />");
  assert.ok(cardIndex >= 0, "Sparks card renders on the profile");
  assert.ok(plansIndex > cardIndex, "Spark plans render below the Sparks card");
  // Display-only boundary (S5) — no payment vocabulary in the profile.
  assert.doesNotMatch(profile, /checkout|purchase|KPay|AYA Pay|UAB Pay|Stripe|payment webhook|Spark pack/i);
});

// ===========================================================================
// Database-backed behavior (run with DATABASE_URL)
// ===========================================================================

test("server summary reports the full balance (125) with no client involvement", { skip: SKIP }, async () => {
  const { getSparkUsageSummary } = await import("../lib/spark-service");
  const userId = await createTestUser("spark_visibility_125");

  await seedEarnedSparks(userId, 125);
  const summary = await getSparkUsageSummary(userId);
  assert.equal(summary.balance, 125);
  assert.equal(summary.earnedSparks, 125);
  assert.equal(summary.subscriptionSparks, 0);
});

test("server summary reports a zero balance without hiding it", { skip: SKIP }, async () => {
  const { getSparkUsageSummary } = await import("../lib/spark-service");
  const userId = await createTestUser("spark_visibility_zero");

  const summary = await getSparkUsageSummary(userId);
  assert.equal(summary.balance, 0);
  assert.equal(summary.earnedSparks, 0);
  assert.equal(summary.subscriptionSparks, 0);
});
