import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserIdForSession } from "@/lib/notifications/session-user";

export async function PATCH(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUserIdForSession(session);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { id } = await context.params;

  const notification = await prisma.notification.findUnique({
    where: { id },
    select: { id: true, recipientUserId: true, readAt: true },
  });

  if (!notification || notification.recipientUserId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (notification.readAt) {
    return NextResponse.json({ success: true });
  }

  await prisma.notification.update({
    where: { id },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
