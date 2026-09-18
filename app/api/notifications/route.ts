import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-user";

const PAGE_SIZE = 30;

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session || !session.authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await resolveUserFromSession(session);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const cursor = request.nextUrl.searchParams.get("cursor");

    const notifications = await prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        actor: { select: { name: true, profileImage: true } },
        snap: { select: { id: true, user: { select: { name: true } } } },
      },
    });

    const hasMore = notifications.length > PAGE_SIZE;
    const page = hasMore ? notifications.slice(0, PAGE_SIZE) : notifications;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    return NextResponse.json({
      notifications: page.map((n) => ({
        id: n.id,
        type: n.type,
        actor: { name: n.actor.name, image: n.actor.profileImage },
        snapId: n.snapId,
        snapOwnerName: n.snap?.user.name ?? null,
        body: n.body,
        read: n.readAt !== null,
        createdAt: n.createdAt.toISOString(),
      })),
      nextCursor,
    });
  } catch (error) {
    console.error("Notification list error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
