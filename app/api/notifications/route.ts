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
    return NextResponse.json({ notifications: [] });
  }

  const notifications = await prisma.notification.findMany({
    where: { recipientUserId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      readAt: true,
      targetUrl: true,
      relatedUserId: true,
      relatedSnapId: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ notifications });
}
