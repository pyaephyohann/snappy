/**
 * D2 — Download Snap Limit with Sparks: Backend / Data Foundation Tests
 *
 * Covers:
 * - Prisma schema & DailyDownloadCounter model contract
 * - Per-user isolation
 * - Daily allowance (1st, 2nd, 3rd free -> 4th exhausted)
 * - Daily reset on next Asia/Yangon day
 * - Midnight boundary (Asia/Yangon UTC+6:30 vs UTC midnight)
 * - Uniqueness constraint per (userId, day)
 * - Concurrency protection under simultaneous consumption
 * - Route contract & authentication enforcement
 * - Spark terminology & absence of obsolete download-ad / localStorage artifacts
 *
 * Run: npm run test:download-d2
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
  const uniqueName = `${namePrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const user = await client.user.create({
    data: {
      name: uniqueName,
      profileImage: "https://example.com/avatar.jpg",
    },
  });
  testUserIds.push(user.id);
  return user.id;
}

before(async () => {
  if (!hasDb) return;
  const client = await db();
  await client.dailyDownloadCounter.deleteMany({
    where: { user: { name: { startsWith: "d2_test_" } } },
  });
});

after(async () => {
  if (!prisma) return;
  for (const userId of testUserIds) {
    await prisma.dailyDownloadCounter.deleteMany({ where: { userId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

// ===========================================================================
// Source-level Architecture & Security Invariants
// ===========================================================================

test("Prisma schema defines DailyDownloadCounter with (userId, day) unique constraint", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model DailyDownloadCounter \{/);
  assert.match(schema, /userId\s+String/);
  assert.match(schema, /day\s+DateTime/);
  assert.match(schema, /count\s+Int\s+@default\(0\)/);
  assert.match(schema, /@@unique\(\[userId, day\]\)/);
  assert.match(schema, /@@map\("daily_download_counters"\)/);
  assert.match(schema, /dailyDownloadCounters\s+DailyDownloadCounter\[\]/);
});

test("download service declares FREE_DAILY_DOWNLOADS = 3 and reuses Yangon day calculation", () => {
  const service = read("lib/download-service.ts");
  assert.match(service, /FREE_DAILY_DOWNLOADS\s*=\s*3/);
  assert.match(service, /getYangonDayDate/);
  assert.match(service, /from ["']@\/lib\/spark-service["']/);
  assert.match(service, /UPDATE "daily_download_counters"/);
  assert.match(service, /WHERE "userId" = \$\{userId\}/);
  assert.match(service, /AND "day" = \$\{yangonDay\}/);
  assert.match(service, /AND "count" < \$\{freeLimit\}/);
  assert.match(service, /RETURNING "count"/);
  assert.doesNotMatch(service, /localStorage/);
  assert.doesNotMatch(service, /points/i);
});

test("download usage API route requires authentication and is private/no-store", () => {
  const route = read("app/api/downloads/usage/route.ts");
  assert.match(route, /getAuthenticatedAppUser/);
  assert.match(route, /status:\s*401/);
  assert.match(route, /getDailyDownloadUsage/);
  assert.match(route, /"Cache-Control":\s*"private, no-cache, no-store"/);
  assert.doesNotMatch(route, /req\.json|searchParams\.get\("userId"\)/);
});

test("no obsolete download-ad, AdModal, or snappy_download_count references exist", () => {
  const filesToCheck = [
    "components/friends/SnapCard.tsx",
    "components/snaps/SnapViewer.tsx",
    "lib/download-service.ts",
    "app/api/downloads/usage/route.ts",
  ];
  for (const file of filesToCheck) {
    const content = read(file);
    assert.doesNotMatch(content, /download-ad/);
    assert.doesNotMatch(content, /AdModal/);
    assert.doesNotMatch(content, /snappy_download_count/);
  }
});

// ===========================================================================
// Database-backed Tests (run with DATABASE_URL)
// ===========================================================================

test("daily allowance: consumes 3 free downloads and exhausts on 4th attempt", { skip: SKIP }, async () => {
  const { consumeFreeDownload, getDailyDownloadUsage } = await import("../lib/download-service");
  const userId = await createTestUser("d2_test_allowance");
  const now = new Date();

  // Initial state: 0 used, 3 remaining
  const initial = await getDailyDownloadUsage(userId, now);
  assert.equal(initial.freeDownloadsUsed, 0);
  assert.equal(initial.freeDownloadsRemaining, 3);
  assert.equal(initial.isFreeExhausted, false);

  // 1st download
  const first = await consumeFreeDownload(userId, now);
  assert.equal(first.consumed, true);
  assert.equal(first.freeDownloadsUsed, 1);
  assert.equal(first.freeDownloadsRemaining, 2);
  assert.equal(first.isFreeExhausted, false);

  // 2nd download
  const second = await consumeFreeDownload(userId, now);
  assert.equal(second.consumed, true);
  assert.equal(second.freeDownloadsUsed, 2);
  assert.equal(second.freeDownloadsRemaining, 1);
  assert.equal(second.isFreeExhausted, false);

  // 3rd download
  const third = await consumeFreeDownload(userId, now);
  assert.equal(third.consumed, true);
  assert.equal(third.freeDownloadsUsed, 3);
  assert.equal(third.freeDownloadsRemaining, 0);
  assert.equal(third.isFreeExhausted, true);

  // 4th download -> must be rejected (exhausted)
  const fourth = await consumeFreeDownload(userId, now);
  assert.equal(fourth.consumed, false);
  if (!fourth.consumed) {
    assert.equal(fourth.reason, "allowance_exhausted");
    assert.equal(fourth.freeDownloadsUsed, 3);
    assert.equal(fourth.freeDownloadsRemaining, 0);
    assert.equal(fourth.isFreeExhausted, true);
  }

  // Final usage verification
  const finalUsage = await getDailyDownloadUsage(userId, now);
  assert.equal(finalUsage.freeDownloadsUsed, 3);
  assert.equal(finalUsage.freeDownloadsRemaining, 0);
  assert.equal(finalUsage.isFreeExhausted, true);
});

test("per-user isolation: User A consuming downloads does not affect User B", { skip: SKIP }, async () => {
  const { consumeFreeDownload, getDailyDownloadUsage } = await import("../lib/download-service");
  const userA = await createTestUser("d2_test_iso_a");
  const userB = await createTestUser("d2_test_iso_b");
  const now = new Date();

  // User A exhausts all 3 downloads
  await consumeFreeDownload(userA, now);
  await consumeFreeDownload(userA, now);
  await consumeFreeDownload(userA, now);

  const usageA = await getDailyDownloadUsage(userA, now);
  assert.equal(usageA.freeDownloadsUsed, 3);
  assert.equal(usageA.isFreeExhausted, true);

  // User B must still have full 3 free downloads
  const usageB = await getDailyDownloadUsage(userB, now);
  assert.equal(usageB.freeDownloadsUsed, 0);
  assert.equal(usageB.freeDownloadsRemaining, 3);
  assert.equal(usageB.isFreeExhausted, false);

  // User B can consume 1st download
  const resB = await consumeFreeDownload(userB, now);
  assert.equal(resB.consumed, true);
  assert.equal(resB.freeDownloadsUsed, 1);
  assert.equal(resB.freeDownloadsRemaining, 2);
});

test("Asia/Yangon midnight boundary: allowance resets at 00:00 Yangon time", { skip: SKIP }, async () => {
  const { consumeFreeDownload, getDailyDownloadUsage } = await import("../lib/download-service");
  const { getYangonDayDate } = await import("../lib/spark-service");
  const userId = await createTestUser("d2_test_yangon_midnight");

  // Yangon is UTC+6:30.
  // 2026-10-01 17:29:59 UTC = 2026-10-01 23:59:59 Yangon time (Day 1)
  const day1Instant = new Date("2026-10-01T17:29:59.000Z");
  // 2026-10-01 17:30:00 UTC = 2026-10-02 00:00:00 Yangon time (Day 2 - Midnight!)
  const day2Instant = new Date("2026-10-01T17:30:00.000Z");

  const day1Date = getYangonDayDate(day1Instant);
  const day2Date = getYangonDayDate(day2Instant);
  assert.notEqual(day1Date.toISOString(), day2Date.toISOString());

  // Exhaust allowance on Day 1
  for (let i = 0; i < 3; i++) {
    const res = await consumeFreeDownload(userId, day1Instant);
    assert.equal(res.consumed, true);
  }
  const day1Exhausted = await consumeFreeDownload(userId, day1Instant);
  assert.equal(day1Exhausted.consumed, false);

  // Cross into Day 2 (17:30 UTC): user gets fresh 3 free downloads
  const day2Usage = await getDailyDownloadUsage(userId, day2Instant);
  assert.equal(day2Usage.freeDownloadsUsed, 0);
  assert.equal(day2Usage.freeDownloadsRemaining, 3);
  assert.equal(day2Usage.isFreeExhausted, false);

  const day2First = await consumeFreeDownload(userId, day2Instant);
  assert.equal(day2First.consumed, true);
  assert.equal(day2First.freeDownloadsUsed, 1);
  assert.equal(day2First.freeDownloadsRemaining, 2);

  // 17:30:01 UTC is one second INTO Yangon day 2 — same day key as
  // 17:30:00, so the counter continues instead of resetting again.
  const day2InstantAfter = new Date("2026-10-01T17:30:01.000Z");
  assert.equal(
    getYangonDayDate(day2InstantAfter).toISOString(),
    day2Date.toISOString(),
  );
  const day2Second = await consumeFreeDownload(userId, day2InstantAfter);
  assert.equal(day2Second.consumed, true);
  assert.equal(day2Second.freeDownloadsUsed, 2);
  assert.equal(day2Second.freeDownloadsRemaining, 1);

  // Day-1 usage is untouched by day-2 consumption (day-keyed rows):
  // 17:29:59 UTC remains an exhausted Yangon day.
  const day1Usage = await getDailyDownloadUsage(userId, day1Instant);
  assert.equal(day1Usage.freeDownloadsUsed, 3);
  assert.equal(day1Usage.freeDownloadsRemaining, 0);
  assert.equal(day1Usage.isFreeExhausted, true);
});

test("uniqueness constraint: duplicate counter records for same user and day cannot be created", { skip: SKIP }, async () => {
  const client = await db();
  const { getYangonDayDate } = await import("../lib/spark-service");
  const userId = await createTestUser("d2_test_uniq");
  const yangonDay = getYangonDayDate(new Date());

  await client.dailyDownloadCounter.create({
    data: {
      userId,
      day: yangonDay,
      count: 1,
    },
  });

  await assert.rejects(
    async () => {
      await client.dailyDownloadCounter.create({
        data: {
          userId,
          day: yangonDay,
          count: 2,
        },
      });
    },
    (err: unknown) => {
      // Prisma P2002: Unique constraint failed
      assert.match(String(err), /Unique constraint failed|P2002/);
      return true;
    },
  );
});

test("concurrency protection: simultaneous requests at allowance boundary cannot exceed limit", { skip: SKIP }, async () => {
  const { consumeFreeDownload, getDailyDownloadUsage } = await import("../lib/download-service");
  const userId = await createTestUser("d2_test_concurrency");
  const now = new Date();

  // User consumes 2 downloads, 1 free remaining
  await consumeFreeDownload(userId, now);
  await consumeFreeDownload(userId, now);

  const beforeUsage = await getDailyDownloadUsage(userId, now);
  assert.equal(beforeUsage.freeDownloadsUsed, 2);
  assert.equal(beforeUsage.freeDownloadsRemaining, 1);

  // Send 5 simultaneous requests attempting to consume the final free download
  const results = await Promise.all(
    Array.from({ length: 5 }, () => consumeFreeDownload(userId, now)),
  );

  const consumedCount = results.filter((r) => r.consumed).length;
  const exhaustedCount = results.filter((r) => !r.consumed).length;

  // Exactly 1 request must succeed in consuming the final download
  assert.equal(consumedCount, 1, `Expected exactly 1 consumed, got ${consumedCount}`);
  assert.equal(exhaustedCount, 4, `Expected 4 rejected as exhausted, got ${exhaustedCount}`);

  // Database must show exactly 3 used, 0 remaining
  const afterUsage = await getDailyDownloadUsage(userId, now);
  assert.equal(afterUsage.freeDownloadsUsed, 3);
  assert.equal(afterUsage.freeDownloadsRemaining, 0);
  assert.equal(afterUsage.isFreeExhausted, true);
});
