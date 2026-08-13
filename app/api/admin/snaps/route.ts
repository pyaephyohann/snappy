import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  adminErrorResponse,
  requireAdminApi,
} from "@/lib/admin-api";

export async function GET(request: NextRequest) {
  try {
    await requireAdminApi();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() ?? "";

    const snaps = await prisma.snap.findMany({
      where: search
        ? {
            OR: [
              {
                caption: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                user: {
                  name: {
                    contains: search,
                    mode: "insensitive",
                  },
                },
              },
            ],
          }
        : undefined,
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
    });

    return NextResponse.json({ snaps });
  } catch (error) {
    const authResponse = adminErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("Admin snaps list error:", error);
    return NextResponse.json(
      { error: "Failed to load snaps" },
      { status: 500 }
    );
  }
}
