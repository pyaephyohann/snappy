import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { updateSharedPasscode } from "@/lib/auth";
import {
  adminErrorResponse,
  isPrismaUniqueError,
  requireAdminApi,
} from "@/lib/admin-api";
import type { Prisma } from "@/generated/prisma/client";

const createUserSchema = z.object({
  name: z
    .string()
    .min(2, "Username must be at least 2 characters")
    .max(50, "Username must be less than 50 characters")
    .trim(),
  role: z.enum(["USER", "ADMIN"]),
  profileImage: z.string().min(1).optional(),
  passcode: z
    .string()
    .min(4, "Passcode must be at least 4 characters")
    .max(20, "Passcode must be less than 20 characters")
    .optional(),
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
      users: users.map((user) => ({
        id: user.id,
        name: user.name,
        role: user.role,
        profileImage: user.profileImage,
        snapCount: user._count.snaps,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })),
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

    const { name, role, profileImage, passcode } = validation.data;

    const user = await prisma.user.create({
      data: {
        name,
        role,
        profileImage: profileImage ?? "/anya.jpeg",
      },
      include: {
        _count: {
          select: { snaps: true },
        },
      },
    });

    if (passcode) {
      await updateSharedPasscode(passcode);
    }

    return NextResponse.json(
      {
        user: {
          id: user.id,
          name: user.name,
          role: user.role,
          profileImage: user.profileImage,
          snapCount: user._count.snaps,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const authResponse = adminErrorResponse(error);
    if (authResponse) return authResponse;

    if (isPrismaUniqueError(error)) {
      return NextResponse.json(
        { error: "A user with this username already exists" },
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
