import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  adminErrorResponse,
  isPrismaUniqueError,
  requireAdminApi,
} from "@/lib/admin-api";
import {
  getNextSlideSortOrder,
  heroCarouselSlideInclude,
  serializeHeroCarouselSlide,
} from "@/lib/hero-carousel-admin";

const createSlideSchema = z.object({
  snapId: z.string().min(1, "Snap ID is required"),
});

export async function GET() {
  try {
    await requireAdminApi();

    const slides = await prisma.heroCarouselSlide.findMany({
      orderBy: { sortOrder: "asc" },
      include: heroCarouselSlideInclude,
    });

    return NextResponse.json({
      slides: slides.map(serializeHeroCarouselSlide),
    });
  } catch (error) {
    const authResponse = adminErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("Admin hero carousel slides GET error:", error);
    return NextResponse.json(
      { error: "Failed to load hero carousel slides" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminApi();

    const body = await request.json();
    const validation = createSlideSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0]?.message ?? "Invalid request data" },
        { status: 400 },
      );
    }

    const { snapId } = validation.data;

    const snap = await prisma.snap.findUnique({
      where: { id: snapId },
      select: { id: true },
    });

    if (!snap) {
      return NextResponse.json({ error: "Snap not found" }, { status: 404 });
    }

    const sortOrder = await getNextSlideSortOrder();

    const slide = await prisma.heroCarouselSlide.create({
      data: {
        snapId,
        sortOrder,
      },
      include: heroCarouselSlideInclude,
    });

    return NextResponse.json(
      { slide: serializeHeroCarouselSlide(slide) },
      { status: 201 },
    );
  } catch (error) {
    const authResponse = adminErrorResponse(error);
    if (authResponse) return authResponse;

    if (isPrismaUniqueError(error)) {
      return NextResponse.json(
        { error: "This snap is already selected for the hero carousel" },
        { status: 409 },
      );
    }

    console.error("Admin hero carousel slides POST error:", error);
    return NextResponse.json(
      { error: "Failed to add hero carousel slide" },
      { status: 500 },
    );
  }
}
