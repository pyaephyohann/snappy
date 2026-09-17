import { NextResponse } from "next/server";
import { requireAuthenticatedAppUser } from "@/lib/auth";
import { unlinkTelegramAccountForUser } from "@/lib/telegram/account";

export async function POST() {
  let user;
  try {
    user = await requireAuthenticatedAppUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const removed = await unlinkTelegramAccountForUser(user.id);
  if (!removed) {
    return NextResponse.json(
      { error: "No Telegram account is linked." },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}
