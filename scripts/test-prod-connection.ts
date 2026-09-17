async function main() {
  const adminPasscode = process.env.ADMIN_PASSCODE;
  const authSecret = process.env.AUTH_SECRET;

  console.log("Production env snapshot (no secrets printed):");
  console.log("   AUTH_SECRET set:", authSecret ? "YES" : "NO");
  console.log("   ADMIN_PASSCODE set:", adminPasscode ? "YES" : "NO");
}

void main();
