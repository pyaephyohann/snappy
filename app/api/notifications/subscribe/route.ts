import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  pushSubscriptionSchema,
  unsubscribeSchema,
} from "@/lib/notifications/push-subscription-schema";

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedAppUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = pushSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const { endpoint, keys, deviceId } = parsed.data;
  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint },
    select: { userId: true },
  });

  if (existing?.userId && existing.userId !== user.id) {
    return NextResponse.json({ error: "Subscription belongs to another user" }, { status: 403 });
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      deviceId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userId: user.id,
    },
    update: {
      deviceId,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userId: user.id,
    },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const user = await getAuthenticatedAppUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = unsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await prisma.pushSubscription.deleteMany({
    where: { endpoint: parsed.data.endpoint, userId: user.id },
  });

  return NextResponse.json({ success: true });
}
