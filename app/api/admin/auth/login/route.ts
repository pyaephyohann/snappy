import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AdminAuthError,
  createAdminSession,
  verifyAdminPasscode,
} from "@/lib/admin-auth";

const isDev = process.env.NODE_ENV !== "production";

const loginSchema = z.object({
  passcode: z
    .string()
    .min(4, "Passcode must be at least 4 characters")
    .max(64, "Passcode must be less than 64 characters"),
});

export async function POST(request: NextRequest) {
  try {
    if (isDev) console.log("[ADMIN LOGIN] Starting admin login request");

    const body = await request.json();
    const validation = loginSchema.safeParse(body);

    if (!validation.success) {
      if (isDev) console.log("[ADMIN LOGIN] Validation failed:", validation.error);
      return NextResponse.json(
        { error: "Invalid request data" },
        { status: 400 },
      );
    }

    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip");

    const isValid = await verifyAdminPasscode(validation.data.passcode, clientIp);
    if (isDev) console.log("[ADMIN LOGIN] Passcode validation result:", isValid);

    if (!isValid) {
      if (isDev) console.error("[ADMIN LOGIN] Admin login failed: Invalid passcode");
      return NextResponse.json(
        { error: "Invalid admin passcode" },
        { status: 401 },
      );
    }

    if (isDev) console.log("[ADMIN LOGIN] Creating admin session");
    await createAdminSession();
    if (isDev) console.log("[ADMIN LOGIN] Admin session created successfully");

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      if (isDev) console.error("[ADMIN LOGIN] Admin auth error:", error.message);
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (isDev) {
      console.error("[ADMIN LOGIN] Admin login error:", error instanceof Error ? error.message : "Unknown error");
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
