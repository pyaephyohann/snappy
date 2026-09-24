import type { SessionData } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type SessionUserRecord = {
  id: string;
  name: string;
  profileImage: string;
};

/**
 * Resolve the acting User row from a signed session.
 *
 * Only active users resolve: a deactivated account must not be able to keep
 * using notification/Snap-interaction routes for the remainder of a 7-day
 * session cookie. This mirrors `getAuthenticatedAppUser()` in `lib/auth.ts`,
 * which filters `isActive: true` for chat and presence routes.
 *
 * Prefer session.userId (per-user passcode auth). Fall back to username only for
 * legacy sessions issued before userId was stored (they expire within 7 days).
 */
export async function resolveUserFromSession(
  session: SessionData,
): Promise<SessionUserRecord | null> {
  if (session.userId) {
    const byId = await prisma.user.findFirst({
      where: { id: session.userId, isActive: true },
      select: { id: true, name: true, profileImage: true },
    });
    if (byId) {
      return byId;
    }
  }

  // Temporary migration compatibility — remove after legacy sessions have expired.
  return prisma.user.findFirst({
    where: { name: session.username, isActive: true },
    select: { id: true, name: true, profileImage: true },
  });
}
