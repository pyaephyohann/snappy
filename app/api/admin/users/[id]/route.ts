import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  adminErrorResponse,
  isPrismaUniqueError,
  requireAdminApi,
} from "@/lib/admin-api";
import { assertPasscodeAvailable, hashPasscode } from "@/lib/passcode-utils";
import {
  resolveProfileImageSnap,
  serializeAdminUser,
} from "@/lib/admin-user-utils";

const updateUserSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name must be less than 50 characters")
    .trim()
    .optional(),
  role: z.enum(["USER", "ADMIN"]).optional(),
  profileImageSnapId: z.string().min(1).nullable().optional(),
  passcode: z
    .string()
    .min(4, "Passcode must be at least 4 characters")
    .max(128, "Passcode must be less than 128 characters")
    .optional(),
  isActive: z.boolean().optional(),
  birthday: z.string().nullable().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminApi();
    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        _count: {
          select: { snaps: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      user: serializeAdminUser(user),
    });
  } catch (error) {
    const authResponse = adminErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("Admin get user error:", error);
    return NextResponse.json(
      { error: "Failed to load user" },
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

    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, role: true },
    });

    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await request.json();
    const validation = updateUserSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0]?.message ?? "Invalid request data" },
        { status: 400 }
      );
    }

    const { name, role, profileImageSnapId, passcode, isActive, birthday } =
      validation.data;

    if (role === "USER" && existingUser.role === "ADMIN") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "You cannot remove admin access from the last admin account" },
          { status: 400 }
        );
      }
    }

    if (passcode) {
      const passcodeCheck = await assertPasscodeAvailable(passcode, id);
      if (!passcodeCheck.ok) {
        return NextResponse.json(
          { error: passcodeCheck.error },
          { status: 409 },
        );
      }
    }

    let profilePatch: { profileImageSnapId?: string | null; profileImage?: string } =
      {};
    if (profileImageSnapId !== undefined) {
      try {
        profilePatch = await resolveProfileImageSnap(profileImageSnapId);
      } catch {
        return NextResponse.json(
          { error: "Selected snap was not found" },
          { status: 400 },
        );
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(role !== undefined ? { role } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(passcode ? { passcodeHash: await hashPasscode(passcode) } : {}),
        ...(profileImageSnapId !== undefined
          ? {
              profileImageSnapId: profilePatch.profileImageSnapId,
              ...(profilePatch.profileImage !== undefined
                ? { profileImage: profilePatch.profileImage }
                : {}),
            }
          : {}),
        ...(birthday !== undefined
          ? { birthday: birthday ? new Date(birthday) : null }
          : {}),
      },
      include: {
        _count: {
          select: { snaps: true },
        },
      },
    });

    return NextResponse.json({
      user: serializeAdminUser(user),
    });
  } catch (error) {
    const authResponse = adminErrorResponse(error);
    if (authResponse) return authResponse;

    if (isPrismaUniqueError(error)) {
      return NextResponse.json(
        { error: "A user with this name already exists" },
        { status: 409 }
      );
    }

    console.error("Admin update user error:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
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

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        role: true,
        _count: {
          select: {
            snaps: true,
            comments: true,
            reactions: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.role === "ADMIN") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "You cannot delete the last admin account" },
          { status: 400 }
        );
      }
    }

    const hasData =
      user._count.snaps > 0 ||
      user._count.comments > 0 ||
      user._count.reactions > 0;

    if (hasData) {
      await prisma.user.update({
        where: { id },
        data: { isActive: false, passcodeHash: null },
      });

      return NextResponse.json({
        success: true,
        disabled: true,
        message: "User was disabled because they have existing activity in Snappy.",
      });
    }

    await prisma.user.delete({ where: { id } });

    return NextResponse.json({ success: true, disabled: false });
  } catch (error) {
    const authResponse = adminErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("Admin delete user error:", error);
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 }
    );
  }
}
