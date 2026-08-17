import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AdminAuthError,
  createAdminSession,
  verifyAdminPasscode,
} from "@/lib/admin-auth";

const loginSchema = z.object({
  passcode: z
    .string()
    .min(4, "Passcode must be at least 4 characters")
    .max(64, "Passcode must be less than 64 characters"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = loginSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request data" },
        { status: 400 }
      );
    }

    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip");

    const isValid = await verifyAdminPasscode(validation.data.passcode, clientIp);

    if (!isValid) {
      console.error("Admin login failed: Invalid passcode");
      return NextResponse.json(
        { error: "Invalid admin passcode" },
        { status: 401 }
      );
    }

    await createAdminSession();

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      console.error("Admin auth error:", error.message);
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Admin login error:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
