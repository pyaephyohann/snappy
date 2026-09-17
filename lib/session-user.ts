import type { SessionData } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type SessionUserRecord = {
  id: string;
  name: string;
  profileImage: string;
};

/**
 * Resolve the acting User row from a signed session.
 * Prefer session.userId (per-user passcode auth). Fall back to username only for
 * legacy sessions issued before userId was stored (they expire within 7 days).
 */
export async function resolveUserFromSession(
  session: SessionData,
): Promise<SessionUserRecord | null> {
  if (session.userId) {
    const byId = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, name: true, profileImage: true },
    });
    if (byId) {
      return byId;
    }
  }

  // Temporary migration compatibility — remove after legacy sessions have expired.
  return prisma.user.findUnique({
    where: { name: session.username },
    select: { id: true, name: true, profileImage: true },
  });
}
