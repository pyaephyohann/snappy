import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { doesPasscodeMatchAdminCredential } from "@/lib/admin-auth";

const BCRYPT_ROUNDS = 10;

export async function hashPasscode(passcode: string): Promise<string> {
  return bcrypt.hash(passcode, BCRYPT_ROUNDS);
}

export async function verifyPasscodeHash(
  passcode: string,
  passcodeHash: string,
): Promise<boolean> {
  return bcrypt.compare(passcode, passcodeHash);
}

/** Ensures passcode is not used by admin credential, env admin, or another user. */
export async function assertPasscodeAvailable(
  passcode: string,
  excludeUserId?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await doesPasscodeMatchAdminCredential(passcode)) {
    return { ok: false, error: "This passcode is already in use." };
  }

  const users = await prisma.user.findMany({
    where: {
      passcodeHash: { not: null },
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true, passcodeHash: true },
  });

  for (const user of users) {
    if (user.passcodeHash && (await bcrypt.compare(passcode, user.passcodeHash))) {
      return { ok: false, error: "This passcode is already in use." };
    }
  }

  return { ok: true };
}
