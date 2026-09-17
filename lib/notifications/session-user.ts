import type { SessionData } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getUserIdForSession(session: SessionData) {
  const user = await prisma.user.findUnique({
    where: { name: session.username },
    select: { id: true, name: true },
  });
  return user;
}
