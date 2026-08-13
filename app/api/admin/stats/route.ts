import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  adminErrorResponse,
  requireAdminApi,
} from "@/lib/admin-api";

export async function GET() {
  try {
    await requireAdminApi();

    const [totalUsers, totalSnaps, adminCount, recentSnaps] = await Promise.all([
      prisma.user.count(),
      prisma.snap.count(),
      prisma.user.count({ where: { role: "ADMIN" } }),
      prisma.snap.findMany({
        take: 6,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              profileImage: true,
            },
          },
        },
      }),
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
