import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserIdForSession } from "@/lib/notifications/session-user";

export async function GET() {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUserIdForSession(session);
  if (!user) {
    return NextResponse.json({ count: 0 });
  }

  const count = await prisma.notification.count({
    where: {
      recipientUserId: user.id,
      readAt: null,
    },
  });

  return NextResponse.json({ count });
}
