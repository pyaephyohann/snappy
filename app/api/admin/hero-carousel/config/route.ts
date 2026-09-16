import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { adminErrorResponse, requireAdminApi } from "@/lib/admin-api";
import {
  getHeroCarouselConfigOrDefault,
} from "@/lib/hero-carousel-admin";
import { HERO_CAROUSEL_CONFIG_ID } from "@/lib/hero-carousel";

const updateConfigSchema = z.object({
  title: z
    .string()
    .max(120, "Title must be less than 120 characters")
    .nullable()
    .optional(),
});

export async function GET() {
  try {
    await requireAdminApi();

    const config = await getHeroCarouselConfigOrDefault();

    return NextResponse.json({
      config: {
        id: config.id,
        title: config.title,
        updatedAt: config.updatedAt,
      },
    });
  } catch (error) {
    const authResponse = adminErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("Admin hero carousel config GET error:", error);
    return NextResponse.json(
      { error: "Failed to load hero carousel configuration" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAdminApi();

    const body = await request.json();
    const validation = updateConfigSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0]?.message ?? "Invalid request data" },
        { status: 400 },
      );
    }

    const { title } = validation.data;

    if (title === undefined) {
      return NextResponse.json(
        { error: "No valid fields provided" },
        { status: 400 },
      );
    }

    const normalizedTitle =
      title === null ? null : title.trim().length > 0 ? title.trim() : null;

    const config = await prisma.heroCarouselConfig.upsert({
      where: { id: HERO_CAROUSEL_CONFIG_ID },
      create: {
        id: HERO_CAROUSEL_CONFIG_ID,
        title: normalizedTitle,
      },
      update: {
        title: normalizedTitle,
      },
    });

    return NextResponse.json({
      config: {
        id: config.id,
        title: config.title,
        updatedAt: config.updatedAt,
      },
    });
  } catch (error) {
    const authResponse = adminErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("Admin hero carousel config PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update hero carousel configuration" },
      { status: 500 },
    );
  }
}
