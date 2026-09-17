import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";
import { clearAdminSession } from "@/lib/admin-auth";

export async function POST() {
  try {
    await clearSession();
    await clearAdminSession();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin logout error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
