import { NextResponse } from "next/server";
import { AdminAuthError, requireAdminSession } from "@/lib/admin-auth";

// TEMPORARY AUTHENTICATION BYPASS FOR DEBUGGING
const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function requireAdminApi() {
  // TEMPORARY: Skip authentication check if BYPASS_AUTH is enabled
  if (BYPASS_AUTH) {
    return;
  }
  return requireAdminSession();
}

export function adminErrorResponse(error: unknown) {
  if (error instanceof AdminAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return null;
}

export function isPrismaUniqueError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  );
}
