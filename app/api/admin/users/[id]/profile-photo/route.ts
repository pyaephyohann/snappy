import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { adminErrorResponse, requireAdminApi } from "@/lib/admin-api";
import { serializeAdminUser } from "@/lib/admin-user-utils";

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
        profileImageSnapId: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const snaps = await prisma.snap.findMany({
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
        profileImageSnapId: user.profileImageSnapId,
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

    const snap = await prisma.snap.findUnique({
      where: { id: snapId },
      select: {
        id: true,
        imageUrl: true,
      },
    });

    if (!snap) {
      return NextResponse.json(
        { error: "Selected snap was not found" },
        { status: 404 },
      );
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        profileImageSnapId: snap.id,
        profileImage: snap.imageUrl,
      },
      include: {
        _count: {
          select: { snaps: true },
        },
      },
    });

    return NextResponse.json({
      user: serializeAdminUser(updatedUser),
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
