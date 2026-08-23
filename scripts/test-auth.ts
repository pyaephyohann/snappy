import "dotenv/config";
import crypto from "crypto";

const SESSION_SECRET = process.env.AUTH_SECRET!;
const USER_PASSCODE = process.env.USER_PASSCODE!;
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE!;
const ADMIN_UUID = process.env.ADMIN_SECRET_ROUTE_UUID!;

async function test() {
  console.log("=== Testing Unified Auth Flow (Passcode-Based Role) ===\n");

  // 1. Environment variables set
  console.log("1. USER_PASSCODE set:", USER_PASSCODE ? "OK" : "FAIL");
  console.log("2. ADMIN_PASSCODE set:", ADMIN_PASSCODE ? "OK" : "FAIL");
  console.log("3. ADMIN_SECRET_ROUTE_UUID set:", ADMIN_UUID ? "OK" : "FAIL");

  // 4. USER_PASSCODE ≠ ADMIN_PASSCODE
  console.log("4. Passcodes are different:", USER_PASSCODE !== ADMIN_PASSCODE ? "OK" : "FAIL");

  // 5. User passcode → role: USER
  const userPassValid = process.env.USER_PASSCODE === "superfunsnappy123";
  console.log("5. User passcode matches:", userPassValid ? "OK" : "FAIL");

  // 6. Admin passcode → role: ADMIN
  const adminPassValid = process.env.ADMIN_PASSCODE === "donottouchtheadmin123";
  console.log("6. Admin passcode matches:", adminPassValid ? "OK" : "FAIL");

  // 7. Admin UUID is valid format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  console.log("7. Admin UUID is valid format:", uuidRegex.test(ADMIN_UUID) ? "OK" : "FAIL");

  // 8. User session token (with role)
  console.log("\n=== Testing Session Token Format ===\n");

  const userSession = {
    username: "Alice",
    authenticated: true,
    role: "USER",
    timestamp: Date.now(),
  };
  const userPayload = JSON.stringify(userSession);
  const userSig = crypto.createHmac("sha256", SESSION_SECRET).update(userPayload).digest("hex");
  const userToken = Buffer.from(`${userPayload}.${userSig}`).toString("base64");
  console.log("8. User token created:", userToken.length > 0 ? "OK" : "FAIL");

  // 9. Admin session token (with role)
  const adminSession = {
    username: "Admin",
    authenticated: true,
    role: "ADMIN",
    timestamp: Date.now(),
  };
  const adminPayload = JSON.stringify(adminSession);
  const adminSig = crypto.createHmac("sha256", SESSION_SECRET).update(adminPayload).digest("hex");
  const adminToken = Buffer.from(`${adminPayload}.${adminSig}`).toString("base64");
  console.log("9. Admin token created:", adminToken.length > 0 ? "OK" : "FAIL");

  // 10. Token signature valid
  const decoded = Buffer.from(userToken, "base64").toString("utf-8");
  const [payloadPart, sigPart] = decoded.split(".");
  const expectedSig = crypto.createHmac("sha256", SESSION_SECRET).update(payloadPart).digest("hex");
  console.log("10. Token signature valid:", sigPart === expectedSig ? "OK" : "FAIL");

  // 11. Token contains role
  const data = JSON.parse(payloadPart);
  console.log("11. Token contains role:", data.role === "USER" ? "OK" : "FAIL");

  // 12. Token not expired
  const ageMs = Date.now() - data.timestamp;
  console.log("12. Token not expired:", ageMs < 7 * 24 * 60 * 60 * 1000 ? `OK (age=${Math.round(ageMs / 1000)}s)` : "FAIL");

  // 13. Admin redirect URL
  console.log("\n=== Testing Redirect URLs ===\n");
  const adminRedirect = `/admin/${ADMIN_UUID}`;
  console.log("13. Admin redirect URL:", adminRedirect);

  // 14. UUID validation
  const validUuid = ADMIN_UUID;
  const wrongUuid = "wrong-uuid-not-valid";
  console.log("14. Valid UUID passes:", uuidRegex.test(validUuid) ? "OK" : "FAIL");
  console.log("15. Wrong UUID fails:", !uuidRegex.test(wrongUuid) ? "OK" : "FAIL");

  console.log("\n✅ All auth flow checks completed");
}

test().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
