import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/lib/auth";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "@/lib/notifications/notification-preferences";
import { notificationPreferenceUpdateSchema } from "@/lib/notifications/notification-preference-schema";

/**
 * Reads the authenticated user's push preferences. The owner is always
 * derived from the server session — never from the request body.
 */
export async function GET() {
  const user = await getAuthenticatedAppUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await getNotificationPreferences(user.id));
}

/** Partial update: only the provided category keys change. */
export async function PATCH(request: NextRequest) {
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

  const parsed = notificationPreferenceUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid preferences" }, { status: 400 });
  }

  return NextResponse.json(
    await updateNotificationPreferences(user.id, parsed.data),
  );
}
