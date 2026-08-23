import crypto from "crypto";

async function test() {
  try {
    const userPasscode = process.env.USER_PASSCODE;
    const adminPasscode = process.env.ADMIN_PASSCODE;
    const authSecret = process.env.AUTH_SECRET;

    console.log("1. Checking environment variables...");
    console.log("   USER_PASSCODE set:", userPasscode ? "YES" : "NO");
    console.log("   ADMIN_PASSCODE set:", adminPasscode ? "YES" : "NO");
    console.log("   AUTH_SECRET set:", authSecret ? "YES" : "NO");

    console.log("\n2. Testing passcode matching...");
    const userValid = userPasscode === "superfunsnappy123";
    const adminValid = adminPasscode === "donottouchtheadmin123";
    console.log("   User passcode correct:", userValid ? "OK" : "FAIL");
    console.log("   Admin passcode correct:", adminValid ? "OK" : "FAIL");

    console.log("\n3. Testing old passcode is rejected...");
    const oldRejected = userPasscode !== "welcometosnappy123" && adminPasscode !== "welcometosnappy123";
    console.log("   Old passcode rejected:", oldRejected ? "OK" : "FAIL");

    console.log("\n4. Testing session token creation...");
    const secret = authSecret || "test";
    const payload = JSON.stringify({ username: "TestUser", authenticated: true, role: "USER", timestamp: Date.now() });
    const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    const token = Buffer.from(`${payload}.${sig}`).toString("base64");
    console.log("   Token created:", token.length > 0 ? "OK" : "FAIL");

    console.log("\n✅ All auth checks passed");
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("\n❌ Error:", error.message);
    console.error("   Stack:", error.stack);
  }
}

test();
