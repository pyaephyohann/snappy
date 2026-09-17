/**
 * Focused auth logic tests (Node built-in test runner — no extra test framework).
 * Run: npm run test:auth
 */
import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { doesPasscodeMatchAdminCredential } from "../lib/admin-auth";
import {
  assertPasscodeAvailable,
  hashPasscode,
  verifyPasscodeHash,
} from "../lib/passcode-utils";

test("doesPasscodeMatchAdminCredential matches ADMIN_PASSCODE env", async () => {
  const previous = process.env.ADMIN_PASSCODE;
  process.env.ADMIN_PASSCODE = "test-admin-env-pass";
  try {
    assert.equal(
      await doesPasscodeMatchAdminCredential("test-admin-env-pass", null),
      true,
    );
    assert.equal(
      await doesPasscodeMatchAdminCredential("some-user-pass", null),
      false,
    );
  } finally {
    if (previous === undefined) {
      delete process.env.ADMIN_PASSCODE;
    } else {
      process.env.ADMIN_PASSCODE = previous;
    }
  }
});

test("doesPasscodeMatchAdminCredential matches stored admin bcrypt hash", async () => {
  const previousEnv = process.env.ADMIN_PASSCODE;
  delete process.env.ADMIN_PASSCODE;

  const hash = await bcrypt.hash("admin-from-db", 10);
  try {
    assert.equal(
      await doesPasscodeMatchAdminCredential("admin-from-db", {
        passcodeHash: hash,
      }),
      true,
    );
    assert.equal(
      await doesPasscodeMatchAdminCredential("not-admin", {
        passcodeHash: hash,
      }),
      false,
    );
  } finally {
    if (previousEnv === undefined) {
      delete process.env.ADMIN_PASSCODE;
    } else {
      process.env.ADMIN_PASSCODE = previousEnv;
    }
  }
});

test("hashPasscode and verifyPasscodeHash round-trip", async () => {
  const hash = await hashPasscode("user-pass-1234");
  assert.equal(await verifyPasscodeHash("user-pass-1234", hash), true);
  assert.equal(await verifyPasscodeHash("wrong", hash), false);
});

test("two distinct user passcodes produce distinct hashes", async () => {
  const hashA = await hashPasscode("user-a-pass");
  const hashB = await hashPasscode("user-b-pass");
  assert.notEqual(hashA, hashB);
  assert.equal(await verifyPasscodeHash("user-a-pass", hashB), false);
  assert.equal(await verifyPasscodeHash("user-b-pass", hashA), false);
});

test(
  "assertPasscodeAvailable rejects passcode equal to ADMIN_PASSCODE env",
  { skip: !process.env.DATABASE_URL ? "DATABASE_URL not set" : false },
  async () => {
    const previous = process.env.ADMIN_PASSCODE;
    process.env.ADMIN_PASSCODE = "blocked-admin-pass";
    try {
      const result = await assertPasscodeAvailable("blocked-admin-pass");
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.match(result.error, /already in use/i);
      }
    } finally {
      if (previous === undefined) {
        delete process.env.ADMIN_PASSCODE;
      } else {
        process.env.ADMIN_PASSCODE = previous;
      }
    }
  },
);
