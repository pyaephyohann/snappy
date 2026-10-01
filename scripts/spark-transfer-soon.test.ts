/**
 * "Transfer Sparks — Soon" regression tests.
 *
 * UI-only placeholder milestone: the profile announces a future Spark
 * transfer feature and the user must not be able to move any Spark.
 *
 * Covers:
 * - the "Transfer Sparks" affordance is visible in the shared profile UI
 * - the "Soon" state is clearly marked (BottomNav badge convention)
 * - the affordance is non-interactive (no handlers, links, routes, fetches)
 * - the displayed Spark balance is untouched (SparkBalanceCard stays the
 *   sole server-authoritative source; the placeholder reads no balance)
 * - no transfer backend exists (no route, action, model, or service code)
 * - the Telegram Mini App keeps the shared profile surface
 *
 * Run: node --env-file-if-exists=.env.local --import tsx --test scripts/spark-transfer-soon.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const root = resolve(import.meta.dirname, "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

/** Recursively lists files under a directory, skipping missing dirs. */
function listFilesRecursively(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listFilesRecursively(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

const card = read("components/sparks/SparkTransferSoonCard.tsx");
const profile = read("components/profile/ProfilePageClient.tsx");

// ===========================================================================
// 1. Feature visible
// ===========================================================================

test("profile shows the Transfer Sparks affordance between balance and plans", () => {
  assert.match(card, /Transfer Sparks/);

  // Rendered on the shared profile surface, in the Spark area.
  assert.match(profile, /import SparkTransferSoonCard/);
  assert.match(profile, /<SparkTransferSoonCard \/>/);

  const balanceIndex = profile.indexOf("<SparkBalanceCard />");
  const transferIndex = profile.indexOf("<SparkTransferSoonCard />");
  const plansIndex = profile.indexOf("<SparkPlanSection />");
  assert.ok(balanceIndex >= 0, "Sparks balance card renders on the profile");
  assert.ok(
    transferIndex > balanceIndex,
    "Transfer Sparks placeholder renders below the balance card",
  );
  assert.ok(
    plansIndex > transferIndex,
    "Spark plans render below the Transfer Sparks placeholder",
  );
});

// ===========================================================================
// 2. Soon state visible
// ===========================================================================

test("the placeholder is clearly marked Soon", () => {
  assert.match(card, /Soon/);
  // Follows the existing BottomNav Soon-badge convention (uppercase, primary).
  assert.match(card, /text-primary/);
  assert.match(card, /uppercase/);
  // Explicitly communicates that transfers are not available yet.
  assert.match(card, /coming soon/i);
  assert.match(card, /nothing can be transferred yet/i);
  assert.match(card, /aria-label="Transfer Sparks, coming soon"/);
});

// ===========================================================================
// 3. Non-interactive
// ===========================================================================

test("the placeholder cannot initiate a transfer", () => {
  // Static JSX only: no click handler, no link, no navigation, no fetch.
  assert.doesNotMatch(card, /onClick|onPress|onSelect/);
  assert.doesNotMatch(card, /<button|<a |<Link|href=/);
  assert.doesNotMatch(card, /fetch\(|useRouter|router\.push|window\.open/);
  // No hooks at all — the card cannot observe or affect app state.
  assert.doesNotMatch(card, /useState|useEffect|useRef|useContext|use[A-Z]/);

  // No transfer route exists anywhere under app/.
  const appRoutes = listFilesRecursively(resolve(root, "app")).filter(
    (file) =>
      file.endsWith("route.ts") && file.toLowerCase().includes("transfer"),
  );
  assert.deepEqual(appRoutes, [], "no transfer route may exist");
});

// ===========================================================================
// 4. Balance unchanged
// ===========================================================================

test("rendering the placeholder does not touch the Spark balance", () => {
  // The placeholder reads/derives no Spark value whatsoever.
  assert.doesNotMatch(card, /usage|balance|amount|SparkTransaction/i);
  assert.doesNotMatch(card, /spark-usage|spark-service|\/api\//);

  // SparkBalanceCard remains the sole server-authoritative display:
  // useSparkUsage renders the balance verbatim, with zero client math.
  const balanceCard = read("components/sparks/SparkBalanceCard.tsx");
  assert.match(balanceCard, /useSparkUsage/);
  assert.match(balanceCard, /\{usage\.balance\} ✨/);
  assert.doesNotMatch(
    balanceCard,
    /usage\.(?:balance|earnedSparks|subscriptionSparks)\s*[-+*/]/,
  );

  // The balance still comes from the single existing usage endpoint.
  const usageHook = read("hooks/useSparkUsage.ts");
  assert.match(usageHook, /export function useSparkUsage/);
  assert.match(usageHook, /\/api\/sparks\/usage/);
});

// ===========================================================================
// 5. No transfer backend
// ===========================================================================

test("no transfer API, action, or model was introduced", () => {
  // Spark routes: exactly one — the existing usage route.
  const sparkRoutes = listFilesRecursively(resolve(root, "app", "api", "sparks"))
    .filter((file) => file.endsWith("route.ts"))
    .map((file) => file.split("/").slice(-3).join("/"));
  assert.deepEqual(sparkRoutes, ["sparks/usage/route.ts"]);

  // No transfer vocabulary in the API surface, Spark service, or schema.
  const forbidden = /\btransfer(?:red|s|ring)?\b/i;
  const backendFiles = [
    "prisma/schema.prisma",
    "lib/spark-service.ts",
    "lib/spark-usage.ts",
    "hooks/useSparkUsage.ts",
    "app/api/sparks/usage/route.ts",
  ];
  for (const file of backendFiles) {
    assert.doesNotMatch(read(file), forbidden, `no transfer code: ${file}`);
  }

  // No SparkTransaction usage and no server action in the placeholder or
  // the profile surface it is rendered from.
  assert.doesNotMatch(card, /SparkTransaction|server action|"use server"/);
  assert.doesNotMatch(profile, /SparkTransaction|"use server"/);

  // No payment vocabulary leaks into the new card (S5 display-only boundary).
  assert.doesNotMatch(
    card,
    /checkout|purchase|KPay|AYA Pay|UAB Pay|Stripe|payment webhook|Spark pack/i,
  );

  // Sparks terminology only — never "points".
  assert.doesNotMatch(card, /\b(?:points?|coins?|XP|gems?)\b/i);
  assert.doesNotMatch(profile, /\b(?:points?|coins?|XP|gems?)\b/i);
});

// ===========================================================================
// 6. Telegram
// ===========================================================================

test("Telegram Mini App keeps the shared profile with the placeholder", () => {
  const telegramProfile = read("components/telegram/TelegramMiniAppProfile.tsx");
  assert.match(telegramProfile, /ProfilePageClient/);
  assert.match(telegramProfile, /homeHref/);

  // One shared implementation — no Telegram-specific transfer code.
  assert.doesNotMatch(telegramProfile, /Transfer|Soon/i);
  assert.doesNotMatch(
    read("components/telegram/TelegramBottomNav.tsx"),
    /Transfer/i,
  );
});
