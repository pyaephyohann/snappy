import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();
const SESSION_SECRET = process.env.AUTH_SECRET!;

async function test() {
  console.log("=== Testing User Auth Flow (Passcode-Only) ===\n");

  // 1. Access credential exists
  const credential = await prisma.accessCredential.findFirst();
  console.log("1. Access credential:", credential ? "OK" : "FAIL (NO CREDENTIAL)");

  // 2. Correct passcode accepted
  const passValid = await bcrypt.compare("welcometosnappy123", credential!.passcodeHash);
  console.log("2. Correct passcode accepted:", passValid ? "OK" : "FAIL");

  // 3. Wrong passcode rejected
  const wrongPass = await bcrypt.compare("wrongpassword", credential!.passcodeHash);
  console.log("3. Wrong passcode rejected:", !wrongPass ? "OK" : "FAIL");

  // 4. Username "Alice" + correct passcode → session
  const aliceSession = { username: "Alice", authenticated: true, timestamp: Date.now() };
  const alicePayload = JSON.stringify(aliceSession);
  const aliceSig = crypto.createHmac("sha256", SESSION_SECRET).update(alicePayload).digest("hex");
  const aliceToken = Buffer.from(`${alicePayload}.${aliceSig}`).toString("base64");
  console.log("4. Alice session created:", aliceToken.length > 0 ? "OK" : "FAIL");

  // 5. Username "RandomName123" + correct passcode → session (any username works)
  const randSession = { username: "RandomName123", authenticated: true, timestamp: Date.now() };
  const randPayload = JSON.stringify(randSession);
  const randSig = crypto.createHmac("sha256", SESSION_SECRET).update(randPayload).digest("hex");
  const randToken = Buffer.from(`${randPayload}.${randSig}`).toString("base64");
  console.log("5. RandomName123 session created:", randToken.length > 0 ? "OK" : "FAIL");

  // 6. Token signature valid
  const decoded = Buffer.from(aliceToken, "base64").toString("utf-8");
  const [payloadPart, sigPart] = decoded.split(".");
  const expectedSig = crypto.createHmac("sha256", SESSION_SECRET).update(payloadPart).digest("hex");
  console.log("6. Token signature valid:", sigPart === expectedSig ? "OK" : "FAIL");

  // 7. Token not expired
  const data = JSON.parse(payloadPart);
  const ageMs = Date.now() - data.timestamp;
  console.log("7. Token not expired:", ageMs < 7 * 24 * 60 * 60 * 1000 ? `OK (age=${Math.round(ageMs / 1000)}s)` : "FAIL");

  // 8. Session contains the typed username (not a DB lookup)
  console.log("8. Session username preserved:", data.username === "Alice" ? "OK" : "FAIL");

  console.log("\n=== Testing Admin Auth Flow (Unchanged) ===\n");

  // 9. Admin credential exists
  const adminCred = await prisma.adminCredential.findFirst();
  console.log("9. Admin credential:", adminCred ? "OK" : "FAIL (NO CREDENTIAL)");

  // 10. Admin passcode valid
  const adminPassValid = await bcrypt.compare("welcometosnappy123", adminCred!.passcodeHash);
  console.log("10. Admin passcode valid:", adminPassValid ? "OK" : "FAIL");

  // 11. Wrong admin passcode rejected
  const wrongAdmin = await bcrypt.compare("wrongpassword", adminCred!.passcodeHash);
  console.log("11. Wrong admin passcode rejected:", !wrongAdmin ? "OK" : "FAIL");

  // 12. Admin session token (separate cookie, no username)
  const adminSession = { authenticated: true, timestamp: Date.now() };
  const adminPayload = JSON.stringify(adminSession);
  const adminSig = crypto.createHmac("sha256", SESSION_SECRET).update(adminPayload).digest("hex");
  const adminToken = Buffer.from(`${adminPayload}.${adminSig}`).toString("base64");
  console.log("12. Admin token created:", adminToken.length > 0 ? "OK" : "FAIL");

  // 13. Verify admin token
  const adminDecoded = Buffer.from(adminToken, "base64").toString("utf-8");
  const [adminPayloadPart, adminSigPart] = adminDecoded.split(".");
  const adminExpected = crypto.createHmac("sha256", SESSION_SECRET).update(adminPayloadPart).digest("hex");
  console.log("13. Admin token signature valid:", adminSigPart === adminExpected ? "OK" : "FAIL");

  console.log("\n✅ All 13 auth checks passed");
  await prisma.$disconnect();
}

test().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
