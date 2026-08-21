import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Edge-compatible session verification using the Web Crypto API.
 *
 * This duplicates the token verification logic from lib/auth.ts and
 * lib/admin-auth.ts so that the middleware can run in the Edge Runtime
 * without importing Prisma (which requires Node.js modules).
 *
 * Both the user and admin session tokens are HMAC-signed JSON payloads
 * containing a timestamp and authenticated flag. The secret is read
 * from the AUTH_SECRET environment variable.
 *
 * IMPORTANT: Any change to the token format in lib/auth.ts or
 * lib/admin-auth.ts must be mirrored here.
 */

const SESSION_COOKIE_NAME = "snappy_session";
const ADMIN_SESSION_COOKIE_NAME = "snappy_admin_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
const ADMIN_SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

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

async function verifyToken(
  token: string,
  secret: string,
  maxAgeSeconds: number,
): Promise<{ authenticated: boolean } | null> {
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const [payload, signature] = decoded.split(".");

    if (!payload || !signature) return null;

    const expectedSignature = await hmacSign(payload, secret);

    if (signature !== expectedSignature) return null;

    const data = JSON.parse(payload) as {
      authenticated: boolean;
      timestamp: number;
    };

    if (!data.authenticated) return null;

    const ageMs = Date.now() - data.timestamp;
    if (ageMs > maxAgeSeconds * 1000) return null;

    return { authenticated: data.authenticated };
  } catch {
    return null;
  }
}

async function hasValidSession(
  request: NextRequest,
  cookieName: string,
  maxAgeSeconds: number,
): Promise<boolean> {
  const secret = getSecret();
  if (!secret) {
    console.error(
      "[MIDDLEWARE] FATAL: AUTH_SECRET not set. Cannot verify sessions.",
    );
    return false;
  }

  const cookie = request.cookies.get(cookieName);
  if (!cookie) return false;

  const result = await verifyToken(cookie.value, secret, maxAgeSeconds);
  return result !== null;
}

/**
 * Next.js Middleware — protects routes at the edge before they reach
 * server components or API handlers.
 */
export default async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // ── Admin routes ────────────────────────────────────────────────
  if (path.startsWith("/admin")) {
    if (path !== "/admin") {
      const hasAdmin = await hasValidSession(
        request,
        ADMIN_SESSION_COOKIE_NAME,
        ADMIN_SESSION_MAX_AGE,
      );
      if (!hasAdmin) {
        return NextResponse.redirect(new URL("/admin", request.url));
      }
    }
    return NextResponse.next();
  }

  // ── User-protected routes ───────────────────────────────────────
  if (path.startsWith("/home") || path.startsWith("/friends")) {
    const hasUser = await hasValidSession(
      request,
      SESSION_COOKIE_NAME,
      SESSION_MAX_AGE,
    );
    if (!hasUser) {
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
