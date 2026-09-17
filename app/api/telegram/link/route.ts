import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedAppUser } from "@/lib/auth";
import { completeTelegramLink } from "@/lib/telegram/link-service";

const bodySchema = z.object({
  token: z.string().min(1),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  let user;
  try {
    user = await requireAuthenticatedAppUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await completeTelegramLink({
    token: parsed.data.token,
    snappyUserId: user.id,
    snappyUserActive: true,
  });

  if (!result.ok) {
    const status =
      result.error === "invalid_token" || result.error === "expired"
        ? 400
        : result.error === "already_used"
          ? 409
          : 409;
    const message = mapLinkError(result.error);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ success: true });
}

function mapLinkError(
  error: Exclude<Awaited<ReturnType<typeof completeTelegramLink>>, { ok: true }>["error"],
): string {
  switch (error) {
    case "invalid_token":
      return "This link is invalid.";
    case "expired":
      return "This link has expired. Request a new one from Telegram with /upload.";
    case "already_used":
      return "This link was already used.";
    case "telegram_taken":
      return "This Telegram account is already linked to another Snappy user.";
    case "user_already_linked":
      return "Your Snappy account is already linked to a different Telegram account.";
    case "user_inactive":
      return "Your Snappy account is not active.";
    default:
      return "Unable to complete linking.";
  }
}
