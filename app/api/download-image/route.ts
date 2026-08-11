import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";

const ALLOWED_HOSTS = new Set([
  "res.cloudinary.com",
  "picsum.photos",
  "api.dicebear.com",
  "i.pinimg.com",
]);

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session.authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const imageUrl = request.nextUrl.searchParams.get("url");

  if (!imageUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (parsedUrl.protocol !== "https:" || !ALLOWED_HOSTS.has(parsedUrl.hostname)) {
    return NextResponse.json({ error: "Url not allowed" }, { status: 403 });
  }

  try {
    const response = await fetch(parsedUrl.toString());

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch image" },
        { status: response.status },
      );
    }

    const contentType =
      response.headers.get("Content-Type") || "application/octet-stream";
    const buffer = await response.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to download image" },
      { status: 500 },
    );
  }
}
