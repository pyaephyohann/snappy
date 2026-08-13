import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  adminErrorResponse,
  requireAdminApi,
} from "@/lib/admin-api";

const updateSnapSchema = z.object({
  caption: z
    .string()
    .max(500, "Caption must be less than 500 characters")
    .nullable()
    .optional(),
  userId: z.string().min(1).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminApi();
    const { id } = await params;

    const snap = await prisma.snap.findUnique({
      where: { id },
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

    if (!snap) {
      return NextResponse.json({ error: "Snap not found" }, { status: 404 });
    }

    return NextResponse.json({ snap });
  } catch (error) {
    const authResponse = adminErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("Admin get snap error:", error);
    return NextResponse.json(
      { error: "Failed to load snap" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminApi();
    const { id } = await params;

    const existingSnap = await prisma.snap.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingSnap) {
      return NextResponse.json({ error: "Snap not found" }, { status: 404 });
    }

    const body = await request.json();
    const validation = updateSnapSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0]?.message ?? "Invalid request data" },
        { status: 400 }
      );
    }

    const { caption, userId } = validation.data;

    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });

      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
    }

    const snap = await prisma.snap.update({
      where: { id },
      data: {
        ...(caption !== undefined
          ? { caption: caption && caption.trim().length > 0 ? caption.trim() : null }
          : {}),
        ...(userId !== undefined ? { userId } : {}),
      },
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

    return NextResponse.json({ snap });
  } catch (error) {
    const authResponse = adminErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("Admin update snap error:", error);
    return NextResponse.json(
      { error: "Failed to update snap" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminApi();
    const { id } = await params;

    const snap = await prisma.snap.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!snap) {
      return NextResponse.json({ error: "Snap not found" }, { status: 404 });
    }

    await prisma.snap.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    const authResponse = adminErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("Admin delete snap error:", error);
    return NextResponse.json(
      { error: "Failed to delete snap" },
      { status: 500 }
    );
  }
}
