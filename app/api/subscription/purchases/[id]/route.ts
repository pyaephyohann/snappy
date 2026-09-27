import { NextResponse } from "next/server";
import { requireAuthenticatedAppUser } from "@/lib/auth";
import { getPurchase } from "@/lib/subscription-purchase-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let user;
  try {
    user = await requireAuthenticatedAppUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const purchase = await getPurchase(user.id, id);
  if (!purchase) {
    // Do not disclose whether a purchase owned by another user exists.
    return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
  }
  return NextResponse.json({ purchase });
}
