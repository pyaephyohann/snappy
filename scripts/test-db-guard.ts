/**
 * Test-database guard for DB-touching integration suites.
 *
 * Problem this solves: integration suites (e.g. scripts/spark-service.test.ts)
 * historically loaded the app's `lib/prisma` singleton, which binds
 * `DATABASE_URL` — the shared application database. An interrupted run then
 * leaves residue (users, snaps) directly in the app database, which surfaced
 * on the user-facing Home "Recent Snaps" feed (see
 * scripts/cleanup-spark-test-residue.ts for the remediation of that incident).
 *
 * Convention: DB-touching suites import this module FIRST, before importing
 * `lib/prisma`, `lib/spark-service`, or any other module that reaches Prisma.
 *
 *   import "./test-db-guard";
 *   import { prisma } from "../lib/prisma";
 *
 * Behavior (fail-closed — a suite can never silently target the app DB):
 * - `TEST_DATABASE_URL` set       → it becomes `DATABASE_URL` before any
 *   Prisma client is constructed, so every client in the process binds the
 *   dedicated test database (app services included — they share the
 *   `lib/prisma` singleton). Refused if it looks like a shared/production
 *   database or is identical to the application `DATABASE_URL`.
 * - Only `DATABASE_URL` set       → hard error. Integration tests must not
 *   reuse the application database; set `TEST_DATABASE_URL` to a dedicated
 *   test database (see docs/spark-economy.md → "Test database isolation").
 * - Neither set                   → no-op; suites keep their graceful skip
 *   behavior for machines with no database configured (nothing to pollute).
 *
 * Secrets: values are never logged — only which variable was chosen.
 *
 * This module has no dependencies and performs no I/O.
 */

const SHARED_DATABASE_INDICATORS = ["prod", "production"];

function looksLikeSharedDatabase(url: string): boolean {
  return SHARED_DATABASE_INDICATORS.some((indicator) =>
    url.toLowerCase().includes(indicator),
  );
}

export function applyTestDatabaseGuard(): void {
  const testUrl = process.env.TEST_DATABASE_URL;

  if (testUrl) {
    const appUrl = process.env.DATABASE_URL;
    if (appUrl && testUrl === appUrl) {
      throw new Error(
        "TEST_DATABASE_URL is identical to the application DATABASE_URL. " +
          "Refusing to point integration tests at the shared database.",
      );
    }
    if (looksLikeSharedDatabase(testUrl)) {
      throw new Error(
        "TEST_DATABASE_URL looks like a shared/production database " +
          `(contains "${SHARED_DATABASE_INDICATORS.join('" or "')}"). ` +
          "Refusing to point integration tests at it.",
      );
    }
    // Assign (not ??=): TEST_DATABASE_URL wins even if DATABASE_URL is set.
    process.env.DATABASE_URL = testUrl;
    console.log("[test-db-guard] Prisma bound to TEST_DATABASE_URL");
    return;
  }

  if (process.env.DATABASE_URL) {
    // Fail closed: the application database is configured, but no dedicated
    // test database was provided. Reusing DATABASE_URL here is exactly how
    // test residue ended up in the shared database (2026-09-30 incident).
    throw new Error(
      "test-db-guard: refusing to run integration tests against the " +
        "application DATABASE_URL. Set TEST_DATABASE_URL to a dedicated " +
        "test database (see docs/spark-economy.md → 'Test database " +
        "isolation'), or unset DATABASE_URL to skip database suites.",
    );
  }

  // No database configured at all: preserve the suites' graceful skip path
  // (suites read DATABASE_URL themselves and skip every test). There is no
  // shared database to pollute here, so skipping is safe.
}

applyTestDatabaseGuard();
