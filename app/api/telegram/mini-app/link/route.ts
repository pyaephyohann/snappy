import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { linkAuthenticatedUserFromInitData } from "@/lib/telegram/mini-app-link-from-init";

const bodySchema = z.object({
  initData: z.string().min(1),
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

  const result = await linkAuthenticatedUserFromInitData(parsed.data.initData);
  if (!result.ok) {
    const status = result.error === "Unauthorized" ? 401 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ success: true });
}
