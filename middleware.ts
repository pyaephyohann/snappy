import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Edge-compatible session verification using the Web Crypto API.
 *
 * This duplicates the token verification logic from lib/auth.ts so that
 * the middleware can run in the Edge Runtime without importing Prisma
 * (which requires Node.js modules).
 *
 * IMPORTANT: Any change to the token format in lib/auth.ts must be
 * mirrored here.
 */

const SESSION_COOKIE_NAME = "snappy_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string | null {
  return process.env.AUTH_SECRET ?? null;
}

/**
 * HMAC-SHA256 using the Web Crypto API (available in Edge Runtime).
 */
async function hmacSign(
  data: string,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  // Convert ArrayBuffer to hex string
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface SessionPayload {
  authenticated: boolean;
  role?: string;
  timestamp: number;
}

async function verifyToken(
  token: string,
  secret: string,
  maxAgeSeconds: number,
): Promise<SessionPayload | null> {
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const [payload, signature] = decoded.split(".");

    if (!payload || !signature) return null;

    const expectedSignature = await hmacSign(payload, secret);

    if (signature !== expectedSignature) return null;

    const data = JSON.parse(payload) as SessionPayload;

    if (!data.authenticated) return null;

    const ageMs = Date.now() - data.timestamp;
    if (ageMs > maxAgeSeconds * 1000) return null;

    return data;
  } catch {
    return null;
  }
}

async function hasValidSession(
  request: NextRequest,
  cookieName: string,
  maxAgeSeconds: number,
): Promise<SessionPayload | null> {
  const secret = getSecret();
  if (!secret) {
    console.error(
      "[MIDDLEWARE] FATAL: AUTH_SECRET not set. Cannot verify sessions.",
    );
    return null;
  }

  const cookie = request.cookies.get(cookieName);
  if (!cookie) return null;

  return verifyToken(cookie.value, secret, maxAgeSeconds);
}

/**
 * Check if a string is a valid UUID (v4 format).
 */
function isValidUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/**
 * Next.js Middleware — protects routes at the edge before they reach
 * server components or API handlers.
 *
 * Admin routes use a secret UUID: /admin/<UUID>
 * Unknown admin paths return 404.
 * Valid UUID but no admin session → redirect to login (/).
 * Valid UUID + admin session → proceed.
 */
export default async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // ── Admin routes ────────────────────────────────────────────────
  if (path.startsWith("/admin")) {
    // Extract the UUID segment after /admin/
    const adminUuid = process.env.ADMIN_SECRET_ROUTE_UUID;
    const segments = path.split("/").filter(Boolean);
    // segments[0] = "admin", segments[1] = uuid or undefined

    // /admin without any UUID → 404
    if (segments.length < 2) {
      return NextResponse.redirect(new URL("/not-found", request.url));
    }

    const uuidSegment = segments[1];

    // If the UUID segment is not a valid UUID format → 404
    if (!isValidUuid(uuidSegment)) {
      return NextResponse.redirect(new URL("/not-found", request.url));
    }

    // If the UUID doesn't match the env var → 404
    if (!adminUuid || uuidSegment !== adminUuid) {
      return NextResponse.redirect(new URL("/not-found", request.url));
    }

    // Valid UUID — now check for admin session
    const session = await hasValidSession(
      request,
      SESSION_COOKIE_NAME,
      SESSION_MAX_AGE,
    );

    if (!session || session.role !== "ADMIN") {
      // No valid admin session → redirect to login
      return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
  }

  // ── User-protected routes ───────────────────────────────────────
  if (path.startsWith("/home") || path.startsWith("/friends")) {
    const session = await hasValidSession(
      request,
      SESSION_COOKIE_NAME,
      SESSION_MAX_AGE,
    );
    if (!session || !session.authenticated) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // ── Public routes ───────────────────────────────────────────────
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
