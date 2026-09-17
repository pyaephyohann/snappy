import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  pushSubscriptionSchema,
  unsubscribeSchema,
} from "@/lib/notifications/push-subscription-schema";

export async function POST(request: NextRequest) {
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

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      deviceId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
    update: {
      deviceId,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
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

  await prisma.pushSubscription
    .delete({
      where: { endpoint: parsed.data.endpoint },
    })
    .catch(() => undefined);

  return NextResponse.json({ success: true });
}
