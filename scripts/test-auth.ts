/**
 * Quick sanity checks for auth env configuration (run with: npx tsx scripts/test-auth.ts)
 */
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE;
const AUTH_SECRET = process.env.AUTH_SECRET;

console.log("Auth configuration checks");
console.log("1. AUTH_SECRET set:", AUTH_SECRET && AUTH_SECRET.length >= 32 ? "OK" : "FAIL");
console.log("2. ADMIN_PASSCODE set:", ADMIN_PASSCODE ? "OK" : "FAIL (optional if DB admin credential exists)");
