import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { adminErrorResponse, requireAdminApi } from "@/lib/admin-api";

const updateProfilePhotoSchema = z.object({
  snapId: z.string().min(1, "Snap ID is required"),
});

const PROFILE_PHOTO_SNAP_LIMIT = 200;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminApi();
    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        profileImage: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const snaps = await prisma.snap.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: PROFILE_PHOTO_SNAP_LIMIT,
      select: {
        id: true,
        imageUrl: true,
        caption: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        profileImage: user.profileImage,
      },
      snaps,
    });
  } catch (error) {
    const authResponse = adminErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("Admin user profile photo options error:", error);
    return NextResponse.json(
      { error: "Failed to load profile photo options" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminApi();
    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await request.json();
    const validation = updateProfilePhotoSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0]?.message ?? "Invalid request data" },
        { status: 400 },
      );
    }

    const { snapId } = validation.data;

    const snap = await prisma.snap.findFirst({
      where: {
        id: snapId,
        userId: id,
      },
      select: {
        id: true,
        imageUrl: true,
      },
    });

    if (!snap) {
      return NextResponse.json(
        { error: "Selected image does not belong to this user" },
        { status: 404 },
      );
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        profileImage: snap.imageUrl,
      },
      include: {
        _count: {
          select: { snaps: true },
        },
      },
    });

    return NextResponse.json({
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        role: updatedUser.role,
        profileImage: updatedUser.profileImage,
        snapCount: updatedUser._count.snaps,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      },
    });
  } catch (error) {
    const authResponse = adminErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("Admin user profile photo update error:", error);
    return NextResponse.json(
      { error: "Failed to update profile photo" },
      { status: 500 },
    );
  }
}
