import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { HEARTBEAT_MIN_WRITE_INTERVAL_MS } from "@/lib/presence";
import { prisma } from "@/lib/prisma";
import { isSocialMutationRateLimited } from "@/lib/social-rate-limit";

/**
 * S7 presence heartbeat.
 *
 * The client can only heartbeat *itself*: the target user always comes from the
 * authenticated session and never from the body, query string, or route.
 */
const heartbeatSchema = z.object({}).strict();

function heartbeatKey(request: Request, userId: string): string {
  return `presence:${userId}:${request.headers.get("x-forwarded-for") ?? "unknown"}`;
}

export async function PATCH(request: NextRequest) {
  const viewer = await getAuthenticatedAppUser();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isSocialMutationRateLimited(heartbeatKey(request, viewer.id))) {
    return NextResponse.json(
      { error: "Too many presence requests. Please try again later." },
      { status: 429 },
    );
  }

  const rawBody = (await request.text()).trim();
  if (rawBody.length > 0) {
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (!heartbeatSchema.safeParse(body).success) {
      return NextResponse.json(
        { error: "Unexpected presence payload" },
        { status: 400 },
      );
    }
  }

  const now = new Date();
  const writeThreshold = new Date(
    now.getTime() - HEARTBEAT_MIN_WRITE_INTERVAL_MS,
  );

  // Atomic conditional write: the database decides whether this heartbeat is
  // suppressed, so concurrent tabs/devices cannot race on a read-then-write.
  const updated = await prisma.user.updateMany({
    where: {
      id: viewer.id,
      isActive: true,
      OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: writeThreshold } }],
    },
    data: { lastSeenAt: now },
  });

  let lastSeenAt = now;
  if (updated.count === 0) {
    const current = await prisma.user.findUnique({
      where: { id: viewer.id },
      select: { lastSeenAt: true },
    });
    if (!current) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    lastSeenAt = current.lastSeenAt ?? now;
  }

  return NextResponse.json({ lastSeenAt: lastSeenAt.toISOString() });
}
