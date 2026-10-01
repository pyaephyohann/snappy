/**
 * D3 — Download Snap Limit with Sparks: Download Flow & UI Integration
 *
 * Covers:
 * - additive SNAP_DOWNLOAD ledger type + migration
 * - authoritative authorizeDownload flow (free-first, then 1 Spark,
 *   single transaction, idempotent on the client's download key)
 * - authorize API auth/validation boundaries
 * - shared client flow (SnapCard + SnapViewer) with confirmation UI and
 *   the Web/Telegram reuse of the same components
 * - free allowance (1st/2nd/3rd free, 4th needs confirmation)
 * - Spark-paid download charges exactly 1 Spark
 * - insufficient Sparks: no authorization, no ledger row
 * - idempotency: same logical request never charges twice
 * - per-user isolation, Asia/Yangon reset, concurrency boundaries
 * - idempotency key scoping across users (D4)
 * - subscription-vs-earned spending for SNAP_DOWNLOAD (D4)
 * - raw image proxy / usage route auth regression (D4)
 * - obsolete download-ad / localStorage counter system stays absent
 *
 * Run: npm run test:download-d3
 */

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import type { PrismaClient } from "@prisma/client";

const hasDb = Boolean(process.env.DATABASE_URL);
const SKIP = !hasDb ? "DATABASE_URL not set" : false;

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

let prisma: PrismaClient | null = null;
const testUserIds: string[] = [];
let sequence = 0;

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
      referenceType: "d3-test",
      referenceId: `d3-seed-${userId}-${Date.now()}-${++sequence}`,
    },
  });
}

/** Seed non-expired Subscription Sparks via the ledger. */
async function seedSubscriptionSparks(userId: string, amount: number) {
  const client = await db();
  return client.sparkTransaction.create({
    data: {
      userId,
      amount,
      type: "SUBSCRIPTION_GRANT",
      source: "SUBSCRIPTION",
      sparkKind: "SUBSCRIPTION",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      referenceType: "d3-test",
      referenceId: `d3-sub-seed-${userId}-${Date.now()}-${++sequence}`,
    },
  });
}

const newKey = () => `d3-${randomUUID()}`;

before(async () => {
  if (!hasDb) return;
  const client = await db();
  await client.user.deleteMany({
    where: { name: { startsWith: "d3_test_" } },
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
// Source-level architecture & security invariants (always run)
// ===========================================================================

test("schema adds SNAP_DOWNLOAD as an additive SparkTransactionType with a matching migration", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(
    schema,
    /Sparks spent on a Snap download beyond the free daily download allowance\.\n  SNAP_DOWNLOAD/,
  );
  // Existing ledger types stay intact.
  for (const existing of [
    "UPLOAD_REWARD",
    "SUBSCRIPTION_GRANT",
    "EXTRA_SNAP_UPLOAD",
    "CAPTION_EDIT",
    "SUBSCRIPTION_EXPIRATION",
    "ADMIN_ADJUSTMENT",
    "REFUND",
  ]) {
    assert.ok(schema.includes(existing), `existing type must remain: ${existing}`);
  }

  const migration = read(
    "prisma/migrations/20261001130000_spark_download_transaction_type/migration.sql",
  );
  assert.match(migration, /ALTER TYPE "SparkTransactionType" ADD VALUE 'SNAP_DOWNLOAD';/);
  assert.doesNotMatch(migration, /DROP|DELETE|UPDATE /i);

  // D2 foundation reused without changes.
  assert.match(schema, /model DailyDownloadCounter \{/);
  assert.match(schema, /@@unique\(\[userId, day\]\)/);
});

test("Spark spend supports a flat 1-Spark download cost through the existing ledger", () => {
  const service = read("lib/spark-service.ts");
  assert.match(service, /export const SPARK_DOWNLOAD_COST = 1;/);
  // The existing atomic spend primitive now accepts SNAP_DOWNLOAD...
  assert.match(
    service,
    /type: "EXTRA_SNAP_UPLOAD" \| "CAPTION_EDIT" \| "SNAP_DOWNLOAD"/,
  );
  assert.match(service, /case "SNAP_DOWNLOAD":[\s\S]{0,80}cost = SPARK_DOWNLOAD_COST;/);
  // ...while plan-driven costs remain plan-driven (no behavior change).
  assert.match(service, /planConfig\.extraUploadCost/);
  assert.match(service, /planConfig\.captionEditCost/);
  // Still one ledger, still row-locked, still no mutable balance on users.
  assert.match(service, /SELECT "id" FROM "users" WHERE "id" = \$\{userId\} FOR UPDATE/);
  assert.match(service, /The ledger \(SparkTransaction\) is the source of truth/);
  assert.doesNotMatch(service, /points/i);
});

test("authorizeDownload runs free-first and Spark-debit in one transaction with an idempotent reference", () => {
  const source = read("lib/download-service.ts");

  assert.match(source, /export async function authorizeDownload/);
  // One transaction wraps free consumption AND the Spark debit.
  assert.match(source, /prisma\.\$transaction/);
  const authorizeBody = source.slice(source.indexOf("export async function authorizeDownload"));
  const freeIndex = authorizeBody.indexOf("incrementDailyDownloadCounter");
  const sparkIndex = authorizeBody.indexOf("atomicSpendSparks");
  assert.ok(freeIndex >= 0, "free allowance is attempted first");
  assert.ok(sparkIndex > freeIndex, "Spark path only runs after free is exhausted");

  assert.match(authorizeBody, /type: "SNAP_DOWNLOAD"/);
  assert.match(authorizeBody, /referenceId: idempotencyKey/);
  assert.match(authorizeBody, /reason: "SPARK_REQUIRED"/);
  assert.match(authorizeBody, /error\.code === "insufficient_sparks"/);
  // The client can never authorize a Spark charge without explicit confirm.
  assert.match(authorizeBody, /if \(!confirmed\) \{/);
  // Yangon day boundary reused from the existing Spark service.
  assert.match(source, /getYangonDayDate/);
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /points/i);
});

test("authorize API is authenticated, session-scoped, validated, and never trusts a client user id", () => {
  const route = read("app/api/downloads/authorize/route.ts");
  assert.match(route, /getAuthenticatedAppUser/);
  assert.match(route, /status: 401/);
  assert.match(route, /authorizeDownload\(user\.id/);
  assert.match(route, /IDEMPOTENCY_KEY_PATTERN/);
  assert.match(route, /Invalid idempotency key/);
  assert.match(route, /"Cache-Control": "private, no-cache, no-store"/);
  assert.match(route, /code: "insufficient_sparks"/);
  assert.match(route, /status: 403/);
  // No client-supplied identity or count anywhere.
  assert.doesNotMatch(route, /userId/);
  assert.doesNotMatch(route, /searchParams/);
  assert.doesNotMatch(route, /localStorage/);
});

test("client flow asks the server before downloading and gates the Spark path on confirmation", () => {
  const contract = read("lib/download-authorization.ts");
  assert.match(contract, /\/api\/downloads\/authorize/);
  assert.match(contract, /confirmed: input\.confirmed === true/);
  assert.match(contract, /OUT_OF_SPARKS_MESSAGE = "You're out of Sparks ✨"/);
  assert.doesNotMatch(contract, /localStorage/);
  assert.doesNotMatch(contract, /points/i);

  const hook = read("hooks/useSnapDownload.ts");
  assert.match(hook, /requestDownloadAuthorization/);
  // Fresh attempts are unconfirmed; only the confirm step spends Sparks.
  assert.match(hook, /confirmed: alreadyCharged/);
  assert.match(hook, /confirmed: true/);
  // Double-click protection + retained idempotency key across retries.
  assert.match(hook, /inFlightRef/);
  assert.match(hook, /chargedKeyRef/);
  assert.match(hook, /generateDownloadIdempotencyKey/);
  // The image transfer happens only after an authorized response.
  assert.match(hook, /if \(result\.authorized\) \{[\s\S]{0,120}runImageDownload/);
  assert.doesNotMatch(hook, /localStorage/);
});

test("confirmation modal uses locked product wording and no 'points' terminology", () => {
  const modal = read("components/snaps/DownloadSparkConfirmModal.tsx");
  assert.match(modal, /Free downloads used/);
  assert.match(modal, /You&apos;ve used all \{freeDailyDownloads\} free downloads today\./);
  assert.match(modal, /Download this Snap for \{costLabel\}\?/);
  assert.match(modal, /Download for \$\{costLabel\}/);
  assert.match(modal, /Cancel/);
  assert.match(modal, /role="alertdialog"/);
  // Cost and allowance always come from the server-provided pending state.
  assert.match(modal, /pending: PendingSparkDownload \| null/);
  assert.doesNotMatch(modal, /points/i);
});

test("shared download flow is wired into the Web and Telegram entry points", () => {
  const card = read("components/friends/SnapCard.tsx");
  assert.match(card, /useSnapDownload/);
  assert.match(card, /DownloadSparkConfirmModal/);
  assert.match(card, /void startDownload\(\)/);
  // The card no longer downloads bytes directly — accounting comes first.
  assert.doesNotMatch(card, /downloadImage\(/);

  const viewer = read("components/snaps/SnapViewer.tsx");
  assert.match(viewer, /useSnapDownload/);
  assert.match(viewer, /DownloadSparkConfirmModal/);
  assert.match(viewer, /trackUsage: true/);
  assert.match(viewer, /Free downloads today: \{downloadUsage\.freeDownloadsUsed\} \/ \{downloadUsage\.freeDailyDownloads\}/);
  assert.doesNotMatch(viewer, /downloadImage\(/);

  // Telegram Mini App renders the very same shared components — no second
  // download accounting system.
  const telegramFeed = read("components/telegram/TelegramSnapFeed.tsx");
  assert.match(telegramFeed, /import SnapCard from "@\/components\/friends\/SnapCard"/);
  assert.match(telegramFeed, /import SnapViewer from "@\/components\/snaps\/SnapViewer"/);
  assert.doesNotMatch(telegramFeed, /localStorage|download-ad/);

  const telegramFind = read("components/telegram/TelegramMiniAppFind.tsx");
  assert.match(telegramFind, /import SnapViewer from "@\/components\/snaps\/SnapViewer"/);
  assert.doesNotMatch(telegramFind, /localStorage|download-ad/);
});

test("obsolete download-ad / localStorage counter system remains absent", () => {
  // No re-introduction anywhere in application code.
  const codeDirs = ["components", "lib", "hooks", "app"];
  const forbidden = /download-ad|AdModal|snappy_download_count/;
  for (const dir of codeDirs) {
    for (const file of listFilesRecursively(resolve(root, dir))) {
      const content = readFileSync(file, "utf8");
      assert.ok(
        !forbidden.test(content),
        `obsolete download-limit reference found in ${file}`,
      );
    }
  }

  // The download feature files never touch localStorage or sessionStorage.
  for (const file of [
    "lib/download-service.ts",
    "lib/download-authorization.ts",
    "app/api/downloads/authorize/route.ts",
    "app/api/downloads/usage/route.ts",
    "hooks/useSnapDownload.ts",
    "components/snaps/DownloadSparkConfirmModal.tsx",
    "components/friends/SnapCard.tsx",
    "components/snaps/SnapViewer.tsx",
  ]) {
    assert.doesNotMatch(read(file), /localStorage|sessionStorage/, file);
  }

  // The image delivery layer stays byte-identical to D1/D2.
  const status = execSync(
    `git status --porcelain -- "lib/download-image.ts" "app/api/download-image/route.ts"`,
    { cwd: root, encoding: "utf8" },
  ).trim();
  assert.equal(status, "", "image download implementation must be untouched");
});

// ===========================================================================
// Database-backed behavior (run with DATABASE_URL)
// ===========================================================================

test("free downloads: 1st, 2nd, 3rd are free and the 4th requires confirmation", { skip: SKIP }, async () => {
  const { authorizeDownload, FREE_DAILY_DOWNLOADS } = await import(
    "../lib/download-service"
  );
  const userId = await createTestUser("d3_test_free");
  const now = new Date();
  assert.equal(FREE_DAILY_DOWNLOADS, 3);

  for (let i = 1; i <= 3; i++) {
    const result = await authorizeDownload(userId, {
      idempotencyKey: newKey(),
      confirmed: false,
      now,
    });
    assert.equal(result.authorized, true, `download ${i} must be free`);
    if (result.authorized) {
      assert.equal(result.mode, "FREE");
      assert.equal(result.freeDownloadsUsed, i);
      assert.equal(result.freeDownloadsRemaining, 3 - i);
      assert.equal(result.isFreeExhausted, i === 3);
      assert.equal(result.freeDailyDownloads, 3);
    }
  }

  // 4th: not confirmed → the server demands the Spark confirmation.
  const fourth = await authorizeDownload(userId, {
    idempotencyKey: newKey(),
    confirmed: false,
    now,
  });
  assert.equal(fourth.authorized, false);
  if (!fourth.authorized) {
    assert.equal(fourth.reason, "SPARK_REQUIRED");
    assert.equal(fourth.sparkCost, 1);
  }
  if (!fourth.authorized && fourth.reason === "SPARK_REQUIRED") {
    assert.equal(fourth.freeDownloadsUsed, 3);
    assert.equal(fourth.freeDownloadsRemaining, 0);
    assert.equal(fourth.isFreeExhausted, true);
  }

  // Nothing was charged while merely asking.
  const client = await db();
  assert.equal(
    await client.dailyDownloadCounter.count({ where: { userId } }),
    1,
    "exactly one day-keyed counter row",
  );
  assert.equal(
    await client.sparkTransaction.count({ where: { userId, type: "SNAP_DOWNLOAD" } }),
    0,
  );
});

test("confirmed Spark download charges exactly 1 Spark through the ledger", { skip: SKIP }, async () => {
  const { authorizeDownload } = await import("../lib/download-service");
  const { getSparkBalance } = await import("../lib/spark-service");
  const userId = await createTestUser("d3_test_spark_paid");
  const now = new Date();

  for (let i = 0; i < 3; i++) {
    await authorizeDownload(userId, { idempotencyKey: newKey(), now });
  }
  await seedEarnedSparks(userId, 5);
  assert.equal((await getSparkBalance(userId)).total, 5);

  const key = newKey();
  const result = await authorizeDownload(userId, {
    idempotencyKey: key,
    confirmed: true,
    now,
  });

  assert.ok(result.authorized && result.mode === "SPARK", "4th download must be authorized as Spark-paid");
  if (result.authorized && result.mode === "SPARK") {
    assert.equal(result.sparkCost, 1);
    assert.equal(result.sparkSpent, 1);
    assert.equal(result.idempotent, false);
    assert.equal(result.freeDownloadsUsed, 3);
    assert.equal(result.freeDownloadsRemaining, 0);
  }

  // Exactly one Spark left the balance; one ledger debit exists.
  assert.equal((await getSparkBalance(userId)).total, 4);
  const client = await db();
  const debit = await client.sparkTransaction.findFirst({
    where: { userId, type: "SNAP_DOWNLOAD" },
  });
  assert.ok(debit, "SNAP_DOWNLOAD debit exists");
  assert.equal(debit.amount, -1);
  assert.equal(debit.source, "SNAP");
  assert.equal(debit.referenceId, key);
  assert.equal(debit.referenceType, "snap");
});

test("insufficient Sparks: no download authorization, no ledger transaction, balance untouched", { skip: SKIP }, async () => {
  const { authorizeDownload } = await import("../lib/download-service");
  const { getSparkBalance } = await import("../lib/spark-service");
  const userId = await createTestUser("d3_test_insufficient");
  const now = new Date();

  for (let i = 0; i < 3; i++) {
    await authorizeDownload(userId, { idempotencyKey: newKey(), now });
  }

  const result = await authorizeDownload(userId, {
    idempotencyKey: newKey(),
    confirmed: true,
    now,
  });

  assert.equal(result.authorized, false);
  if (!result.authorized) {
    assert.equal(result.reason, "INSUFFICIENT_SPARKS");
    assert.equal(result.sparkCost, 1);
  }

  const client = await db();
  assert.equal(
    await client.sparkTransaction.count({ where: { userId, type: "SNAP_DOWNLOAD" } }),
    0,
    "no Spark transaction on a failed authorization",
  );
  assert.equal((await getSparkBalance(userId)).total, 0);
});

test("idempotent replay: the same logical request never charges twice", { skip: SKIP }, async () => {
  const { authorizeDownload } = await import("../lib/download-service");
  const { getSparkBalance } = await import("../lib/spark-service");
  const userId = await createTestUser("d3_test_idempotent");
  const now = new Date();

  for (let i = 0; i < 3; i++) {
    await authorizeDownload(userId, { idempotencyKey: newKey(), now });
  }
  await seedEarnedSparks(userId, 5);

  const key = newKey();
  const first = await authorizeDownload(userId, { idempotencyKey: key, confirmed: true, now });
  const replay = await authorizeDownload(userId, { idempotencyKey: key, confirmed: true, now });

  assert.ok(first.authorized && first.mode === "SPARK", "first charge authorized as Spark-paid");
  assert.ok(replay.authorized && replay.mode === "SPARK", "replay authorized without a second charge");
  if (first.authorized && first.mode === "SPARK") {
    assert.equal(first.idempotent, false);
  }
  if (replay.authorized && replay.mode === "SPARK") {
    assert.equal(replay.idempotent, true, "replay must not charge again");
    assert.equal(replay.sparkSpent, 1);
  }

  const client = await db();
  assert.equal(
    await client.sparkTransaction.count({
      where: { userId, type: "SNAP_DOWNLOAD", referenceId: key },
    }),
    1,
    "exactly one ledger row for one logical download",
  );
  assert.equal((await getSparkBalance(userId)).total, 4, "charged once, not twice");
});

test("per-user isolation: one user's downloads and Sparks never affect another", { skip: SKIP }, async () => {
  const { authorizeDownload } = await import("../lib/download-service");
  const { getSparkBalance } = await import("../lib/spark-service");
  const userA = await createTestUser("d3_test_iso_a");
  const userB = await createTestUser("d3_test_iso_b");
  const now = new Date();

  await seedEarnedSparks(userA, 3);
  await seedEarnedSparks(userB, 4);

  // A exhausts the free allowance and pays 1 Spark.
  for (let i = 0; i < 3; i++) {
    await authorizeDownload(userA, { idempotencyKey: newKey(), now });
  }
  const paid = await authorizeDownload(userA, {
    idempotencyKey: newKey(),
    confirmed: true,
    now,
  });
  assert.equal(paid.authorized, true);
  if (paid.authorized) assert.equal(paid.mode, "SPARK");

  // B still has a full free allowance and an untouched balance.
  const freeB = await authorizeDownload(userB, { idempotencyKey: newKey(), now });
  assert.equal(freeB.authorized, true);
  if (freeB.authorized) {
    assert.equal(freeB.mode, "FREE");
    assert.equal(freeB.freeDownloadsUsed, 1);
    assert.equal(freeB.freeDownloadsRemaining, 2);
  }

  assert.equal((await getSparkBalance(userA)).total, 2);
  assert.equal((await getSparkBalance(userB)).total, 4);
  const client = await db();
  assert.equal(await client.sparkTransaction.count({ where: { userId: userB, type: "SNAP_DOWNLOAD" } }), 0);
  assert.equal(
    await client.sparkTransaction.count({ where: { userId: userA, type: "SNAP_DOWNLOAD" } }),
    1,
  );
});

test("Yangon reset: a new Asia/Yangon day restores the free allowance", { skip: SKIP }, async () => {
  const { authorizeDownload } = await import("../lib/download-service");
  const { getYangonDayDate } = await import("../lib/spark-service");
  const userId = await createTestUser("d3_test_yangon_reset");

  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  assert.notEqual(
    getYangonDayDate(today).toISOString(),
    getYangonDayDate(tomorrow).toISOString(),
    "reference instants must fall on different Yangon days",
  );

  for (let i = 0; i < 3; i++) {
    await authorizeDownload(userId, { idempotencyKey: newKey(), now: today });
  }
  const exhausted = await authorizeDownload(userId, {
    idempotencyKey: newKey(),
    now: today,
  });
  assert.equal(exhausted.authorized, false);
  if (!exhausted.authorized) assert.equal(exhausted.reason, "SPARK_REQUIRED");

  const nextDay = await authorizeDownload(userId, {
    idempotencyKey: newKey(),
    now: tomorrow,
  });
  assert.equal(nextDay.authorized, true);
  if (nextDay.authorized) {
    assert.equal(nextDay.mode, "FREE");
    assert.equal(nextDay.freeDownloadsUsed, 1);
    assert.equal(nextDay.freeDownloadsRemaining, 2);
  }
});

test("concurrency: the final free allowance slot cannot be overspent", { skip: SKIP }, async () => {
  const { authorizeDownload } = await import("../lib/download-service");
  const userId = await createTestUser("d3_test_concurrency_free");
  const now = new Date();

  await authorizeDownload(userId, { idempotencyKey: newKey(), now });
  await authorizeDownload(userId, { idempotencyKey: newKey(), now });

  const results = await Promise.all([
    authorizeDownload(userId, { idempotencyKey: newKey(), confirmed: false, now }),
    authorizeDownload(userId, { idempotencyKey: newKey(), confirmed: false, now }),
  ]);

  const freeWins = results.filter((r) => r.authorized && r.mode === "FREE");
  const required = results.filter(
    (r) => !r.authorized && "reason" in r && r.reason === "SPARK_REQUIRED",
  );
  assert.equal(freeWins.length, 1, `exactly one FREE winner, got ${freeWins.length}`);
  assert.equal(required.length, 1, `the loser must be told Spark is required, got ${required.length}`);

  const client = await db();
  const rows = await client.dailyDownloadCounter.findMany({ where: { userId } });
  assert.equal(rows.length, 1, "one day-keyed counter row");
  assert.equal(rows[0].count, 3, "count must be exactly 3 — no overspend");
});

test("concurrency: simultaneous confirmed requests with one key charge exactly once", { skip: SKIP }, async () => {
  const { authorizeDownload } = await import("../lib/download-service");
  const { getSparkBalance } = await import("../lib/spark-service");
  const userId = await createTestUser("d3_test_concurrency_spark");
  const now = new Date();

  for (let i = 0; i < 3; i++) {
    await authorizeDownload(userId, { idempotencyKey: newKey(), now });
  }
  await seedEarnedSparks(userId, 5);

  const key = newKey();
  const results = await Promise.all([
    authorizeDownload(userId, { idempotencyKey: key, confirmed: true, now }),
    authorizeDownload(userId, { idempotencyKey: key, confirmed: true, now }),
  ]);

  for (const result of results) {
    assert.equal(result.authorized, true);
    if (result.authorized && result.mode === "SPARK") {
      assert.equal(result.sparkSpent, 1);
    }
  }
  const idempotentCount = results.filter(
    (r) => r.authorized && r.mode === "SPARK" && r.idempotent,
  ).length;
  assert.equal(idempotentCount, 1, "exactly one request reports the idempotent replay");

  const client = await db();
  assert.equal(
    await client.sparkTransaction.count({
      where: { userId, type: "SNAP_DOWNLOAD", referenceId: key },
    }),
    1,
    "concurrent retries with one key must produce one ledger row",
  );
  assert.equal((await getSparkBalance(userId)).total, 4, "charged exactly 1 Spark in total");
});

test("idempotency keys are scoped per user: reusing another user's key never replays their charge", { skip: SKIP }, async () => {
  const { authorizeDownload } = await import("../lib/download-service");
  const { getSparkBalance } = await import("../lib/spark-service");
  const userA = await createTestUser("d3_test_key_scope_a");
  const userB = await createTestUser("d3_test_key_scope_b");
  const now = new Date();

  await seedEarnedSparks(userA, 5);
  await seedEarnedSparks(userB, 5);
  for (const userId of [userA, userB]) {
    for (let i = 0; i < 3; i++) {
      await authorizeDownload(userId, { idempotencyKey: newKey(), now });
    }
  }

  const sharedKey = newKey();
  const a = await authorizeDownload(userA, {
    idempotencyKey: sharedKey,
    confirmed: true,
    now,
  });
  assert.ok(a.authorized && a.mode === "SPARK", "A's confirmed charge authorized");
  if (a.authorized && a.mode === "SPARK") {
    assert.equal(a.idempotent, false);
  }

  // B submits A's key: it must be B's own NEW logical reference — B is
  // charged independently and can never replay or read A's transaction.
  const b = await authorizeDownload(userB, {
    idempotencyKey: sharedKey,
    confirmed: true,
    now,
  });
  assert.ok(b.authorized && b.mode === "SPARK", "B's confirmed charge authorized");
  if (b.authorized && b.mode === "SPARK") {
    assert.equal(
      b.idempotent,
      false,
      "B must not replay A's charge via a reused key",
    );
  }

  const client = await db();
  const rowsA = await client.sparkTransaction.findMany({
    where: { userId: userA, type: "SNAP_DOWNLOAD", referenceId: sharedKey },
  });
  const rowsB = await client.sparkTransaction.findMany({
    where: { userId: userB, type: "SNAP_DOWNLOAD", referenceId: sharedKey },
  });
  assert.equal(rowsA.length, 1, "A has exactly one row for the shared key");
  assert.equal(rowsB.length, 1, "B has exactly one row for the shared key");
  assert.notEqual(rowsA[0].id, rowsB[0].id, "ledger rows are per-user");

  // Both charged exactly once; neither balance was touched by the other.
  assert.equal((await getSparkBalance(userA)).total, 4);
  assert.equal((await getSparkBalance(userB)).total, 4);
});

test("Spark-paid download spends subscription Sparks before earned Sparks", { skip: SKIP }, async () => {
  const { authorizeDownload } = await import("../lib/download-service");
  const { getSparkBalance } = await import("../lib/spark-service");
  const userId = await createTestUser("d3_test_sub_earned");
  const now = new Date();

  for (let i = 0; i < 3; i++) {
    await authorizeDownload(userId, { idempotencyKey: newKey(), now });
  }
  await seedSubscriptionSparks(userId, 10);
  await seedEarnedSparks(userId, 5);
  assert.deepEqual(await getSparkBalance(userId), {
    total: 15,
    earned: 5,
    subscription: 10,
  });

  const result = await authorizeDownload(userId, {
    idempotencyKey: newKey(),
    confirmed: true,
    now,
  });
  assert.ok(result.authorized && result.mode === "SPARK", "paid download authorized");
  if (result.authorized && result.mode === "SPARK") {
    assert.equal(result.sparkCost, 1);
    assert.equal(result.sparkSpent, 1);
  }

  // Subscription-first priority holds for SNAP_DOWNLOAD: the 1 Spark comes
  // out of the subscription pool, earned Sparks stay untouched, and the
  // single debit row is a SUBSCRIPTION-kind ledger entry.
  assert.deepEqual(await getSparkBalance(userId), {
    total: 14,
    earned: 5,
    subscription: 9,
  });
  const client = await db();
  const debit = await client.sparkTransaction.findFirst({
    where: { userId, type: "SNAP_DOWNLOAD" },
  });
  assert.ok(debit, "SNAP_DOWNLOAD debit exists");
  assert.equal(debit.amount, -1);
  assert.equal(debit.sparkKind, "SUBSCRIPTION");
});

test("raw image proxy and usage route refuse unauthenticated access (no byte-layer bypass)", () => {
  // §12: unauthenticated callers get 401 from the byte proxy — it can never
  // hand out image bytes without a session.
  const proxy = read("app/api/download-image/route.ts");
  assert.match(proxy, /requireSession/);
  assert.match(proxy, /status: 401/);
  assert.match(proxy, /ALLOWED_HOSTS/);
  // Accounting deliberately stays OUT of the byte layer: the proxy must not
  // import the download service (authorization happens in
  // POST /api/downloads/authorize before bytes are ever fetched).
  assert.doesNotMatch(proxy, /download-service|authorizeDownload/);

  // The read-only usage endpoint is session-scoped as well.
  const usage = read("app/api/downloads/usage/route.ts");
  assert.match(usage, /getAuthenticatedAppUser/);
  assert.match(usage, /status: 401/);
  assert.doesNotMatch(usage, /localStorage|sessionStorage/);
});
