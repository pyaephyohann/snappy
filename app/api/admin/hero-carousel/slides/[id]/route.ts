import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { adminErrorResponse, requireAdminApi } from "@/lib/admin-api";
import {
  heroCarouselSlideInclude,
  reassignSlideOrder,
  serializeHeroCarouselSlide,
} from "@/lib/hero-carousel-admin";

const updateSlideSchema = z
  .object({
    sortOrder: z.number().int().min(0).optional(),
    altText: z
      .string()
      .max(200, "Alt text must be less than 200 characters")
      .nullable()
      .optional(),
  })
  .refine(
    (data) => data.sortOrder !== undefined || data.altText !== undefined,
    { message: "No valid fields provided" },
  );

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminApi();
    const { id } = await params;

    const existingSlide = await prisma.heroCarouselSlide.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingSlide) {
      return NextResponse.json(
        { error: "Hero carousel slide not found" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const validation = updateSlideSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0]?.message ?? "Invalid request data" },
        { status: 400 },
      );
    }

    const { sortOrder, altText } = validation.data;

    const normalizedAltText =
      altText === undefined
        ? undefined
        : altText === null
          ? null
          : altText.trim().length > 0
            ? altText.trim()
            : null;

    if (sortOrder !== undefined) {
      const reorderedSlide = await reassignSlideOrder(id, sortOrder);
      if (!reorderedSlide) {
        return NextResponse.json(
          { error: "Hero carousel slide not found" },
          { status: 404 },
        );
      }

      if (normalizedAltText === undefined) {
        return NextResponse.json({
          slide: serializeHeroCarouselSlide(reorderedSlide),
        });
      }

      const slide = await prisma.heroCarouselSlide.update({
        where: { id },
        data: { altText: normalizedAltText },
        include: heroCarouselSlideInclude,
      });

      return NextResponse.json({
        slide: serializeHeroCarouselSlide(slide),
      });
    }

    const slide = await prisma.heroCarouselSlide.update({
      where: { id },
      data: { altText: normalizedAltText },
      include: heroCarouselSlideInclude,
    });

    return NextResponse.json({
      slide: serializeHeroCarouselSlide(slide),
    });
  } catch (error) {
    const authResponse = adminErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("Admin hero carousel slide PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update hero carousel slide" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminApi();
    const { id } = await params;

    const slide = await prisma.heroCarouselSlide.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!slide) {
      return NextResponse.json(
        { error: "Hero carousel slide not found" },
        { status: 404 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.heroCarouselSlide.delete({ where: { id } });

      const remaining = await tx.heroCarouselSlide.findMany({
        orderBy: { sortOrder: "asc" },
      });

      await Promise.all(
        remaining.map((item, index) =>
          tx.heroCarouselSlide.update({
            where: { id: item.id },
            data: { sortOrder: index },
          }),
        ),
      );
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const authResponse = adminErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("Admin hero carousel slide DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to remove hero carousel slide" },
      { status: 500 },
    );
  }
}
