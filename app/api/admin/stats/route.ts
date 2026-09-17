import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  adminErrorResponse,
  requireAdminApi,
} from "@/lib/admin-api";
import {
  ADMIN_RECENT_SNAPS_LIMIT,
  getRecentSnaps,
} from "@/lib/recent-snaps";

export async function GET() {
  try {
    await requireAdminApi();

    const [totalUsers, totalSnaps, adminCount, recentSnaps] = await Promise.all([
      prisma.user.count(),
      prisma.snap.count(),
      prisma.user.count({ where: { role: "ADMIN" } }),
      getRecentSnaps(ADMIN_RECENT_SNAPS_LIMIT),
    ]);

    return NextResponse.json({
      stats: {
        totalUsers,
        totalSnaps,
        adminCount,
      },
      recentSnaps,
    });
  } catch (error) {
    const authResponse = adminErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("Admin stats error:", error);
    return NextResponse.json(
      { error: "Failed to load dashboard data" },
      { status: 500 }
    );
  }
}
