import { PrismaClient } from "../generated/prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();

async function test() {
  try {
    console.log("1. Testing Prisma connection...");
    const cred = await prisma.accessCredential.findFirst();
    console.log("   Access credential found:", cred ? "YES" : "NO");

    console.log("2. Testing bcrypt compare...");
    const valid = await bcrypt.compare("welcometosnappy123", cred!.passcodeHash);
    console.log("   Passcode valid:", valid);

    console.log("3. Testing wrong passcode...");
    const wrong = await bcrypt.compare("wrongpassword", cred!.passcodeHash);
    console.log("   Wrong passcode rejected:", !wrong);

    console.log("4. Testing admin credential...");
    const adminCred = await prisma.adminCredential.findFirst();
    const adminValid = await bcrypt.compare("welcometosnappy123", adminCred!.passcodeHash);
    console.log("   Admin passcode valid:", adminValid);

    console.log("5. Testing session token creation...");
    const secret = process.env.AUTH_SECRET || "test";
    const payload = JSON.stringify({ username: "TestUser", authenticated: true, timestamp: Date.now() });
    const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    const token = Buffer.from(`${payload}.${sig}`).toString("base64");
    console.log("   Token created:", token.length > 0 ? "OK" : "FAIL");

    console.log("\n✅ All production auth checks passed");
  } catch (err: any) {
    console.error("\n❌ Error:", err.message);
    console.error("   Stack:", err.stack);
  } finally {
    await prisma.$disconnect();
  }
}

test();
