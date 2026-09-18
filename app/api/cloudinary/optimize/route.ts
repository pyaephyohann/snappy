import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  ImageOptimizationError,
  optimizeRasterImage,
} from "@/lib/image-optimization";
import { SNAP_MAX_IMAGE_BYTES } from "@/lib/snap-media";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session?.authenticated || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "An image file is required" },
        { status: 400 },
      );
    }

    if (!file.size || file.size > SNAP_MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Image must be non-empty and no larger than 10 MB" },
        { status: 413 },
      );
    }

    const optimized = await optimizeRasterImage(
      Buffer.from(await file.arrayBuffer()),
      file.type,
    );

    return new NextResponse(new Uint8Array(optimized.buffer), {
      status: 200,
      headers: {
        "Content-Type": optimized.mimeType,
        "Content-Length": optimized.buffer.length.toString(),
        "X-Snappy-Image-Width": optimized.width.toString(),
        "X-Snappy-Image-Height": optimized.height.toString(),
      },
    });
  } catch (error) {
    if (error instanceof ImageOptimizationError) {
      const status = error.code === "too_large" ? 413 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    console.error("Image optimization error:", error);
    return NextResponse.json(
      { error: "Unable to process image" },
      { status: 500 },
    );
  }
}
