import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  adminErrorResponse,
  isPrismaUniqueError,
  requireAdminApi,
} from "@/lib/admin-api";
import type { Prisma } from "@prisma/client";
import { assertPasscodeAvailable, hashPasscode } from "@/lib/passcode-utils";
import {
  resolveProfileImageSnap,
  serializeAdminUser,
} from "@/lib/admin-user-utils";

const createUserSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name must be less than 50 characters")
    .trim(),
  role: z.enum(["USER", "ADMIN"]).default("USER"),
  profileImageSnapId: z.string().min(1).nullable().optional(),
  passcode: z
    .string()
    .min(4, "Passcode must be at least 4 characters")
    .max(128, "Passcode must be less than 128 characters"),
  isActive: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireAdminApi();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const roleFilter = searchParams.get("role");

    const where: Prisma.UserWhereInput = {
      ...(search
        ? {
            name: {
              contains: search,
              mode: "insensitive",
            },
          }
        : {}),
      ...(roleFilter === "ADMIN" || roleFilter === "USER"
        ? { role: roleFilter }
        : {}),
    };

    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { snaps: true },
        },
      },
    });

    return NextResponse.json({
      users: users.map((user) => serializeAdminUser(user)),
    });
  } catch (error) {
    const authResponse = adminErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("Admin users list error:", error);
    return NextResponse.json(
      { error: "Failed to load users" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminApi();

    const body = await request.json();
    const validation = createUserSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0]?.message ?? "Invalid request data" },
        { status: 400 }
      );
    }

    const { name, role, profileImageSnapId, passcode, isActive } =
      validation.data;

    const passcodeCheck = await assertPasscodeAvailable(passcode);
    if (!passcodeCheck.ok) {
      return NextResponse.json({ error: passcodeCheck.error }, { status: 409 });
    }

    let profileData: { profileImageSnapId?: string | null; profileImage?: string } =
      {};
    try {
      if (profileImageSnapId !== undefined) {
        profileData = await resolveProfileImageSnap(profileImageSnapId);
      }
    } catch {
      return NextResponse.json(
        { error: "Selected snap was not found" },
        { status: 400 },
      );
    }

    const passcodeHash = await hashPasscode(passcode);

    const user = await prisma.user.create({
      data: {
        name,
        role,
        passcodeHash,
        isActive: isActive ?? true,
        profileImage: profileData.profileImage ?? "/anya.jpeg",
        ...(profileData.profileImageSnapId !== undefined
          ? { profileImageSnapId: profileData.profileImageSnapId }
          : {}),
      },
      include: {
        _count: {
          select: { snaps: true },
        },
      },
    });

    return NextResponse.json(
      { user: serializeAdminUser(user) },
      { status: 201 }
    );
  } catch (error) {
    const authResponse = adminErrorResponse(error);
    if (authResponse) return authResponse;

    if (isPrismaUniqueError(error)) {
      return NextResponse.json(
        { error: "A user with this name already exists" },
        { status: 409 }
      );
    }

    console.error("Admin create user error:", error);
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }
}
