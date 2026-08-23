import { cookies } from "next/headers";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

/**
 * NOTE: Admin sessions are now stored in the unified snappy_session cookie
 * with role: "ADMIN". This file is kept for backward compatibility with
 * existing admin API routes that call requireAdminSession() / getAdminSession().
 *
 * The primary auth flow is in lib/auth.ts.
 */

const ADMIN_SESSION_COOKIE_NAME = "snappy_admin_session";
const ADMIN_SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

/**
 * Returns the HMAC secret used to sign admin session tokens.
 * Same secret as user sessions — consistent signing across the app.
 */
function getAdminSessionSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "[ADMIN AUTH] FATAL: AUTH_SECRET environment variable is not set. " +
      "Set a strong, random value in your Vercel environment variables.",
    );
  }
  return secret;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

/**
 * In-memory rate limiting.
 *
 * NOTE: In a serverless environment (Vercel), each function invocation
 * has its own in-memory state. This means the rate limit resets on every
 * cold start. For true rate limiting you would need an external store
 * (Redis, database, etc.). This in-memory version still provides some
 * protection within a single function lifetime and prevents rapid-fire
 * attacks from the same instance.
 */
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();

export class AdminAuthError extends Error {
  constructor(
    message: string,
    public status: 401 | 403 | 429,
  ) {
    super(message);
    this.name = "AdminAuthError";
  }
}

export interface AdminSessionData {
  authenticated: true;
}

function createAdminSessionToken(data: AdminSessionData): string {
  const secret = getAdminSessionSecret();
  const timestamp = Date.now();
  const payload = JSON.stringify({ ...data, timestamp });
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return Buffer.from(`${payload}.${signature}`).toString("base64");
}

function verifyAdminSessionToken(token: string): AdminSessionData | null {
  try {
    const secret = getAdminSessionSecret();
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const [payload, signature] = decoded.split(".");

    if (!payload || !signature) {
      return null;
    }

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    if (signature !== expectedSignature) {
      return null;
    }

    const data = JSON.parse(payload) as AdminSessionData & { timestamp: number };

    const sessionAgeMs = Date.now() - data.timestamp;
    if (sessionAgeMs > ADMIN_SESSION_MAX_AGE * 1000) {
      return null;
    }

    if (!data.authenticated) {
      return null;
    }

    return { authenticated: true };
  } catch {
    return null;
  }
}

function getClientKey(ip: string | null): string {
  return ip ?? "unknown";
}

function assertNotRateLimited(clientKey: string) {
  const record = failedAttempts.get(clientKey);
  if (!record) return;

  if (record.lockedUntil > Date.now()) {
    throw new AdminAuthError("Too many failed attempts. Please try again later.", 429);
  }

  if (record.lockedUntil <= Date.now() && record.count >= MAX_FAILED_ATTEMPTS) {
    failedAttempts.delete(clientKey);
  }
}

function recordFailedAttempt(clientKey: string) {
  const existing = failedAttempts.get(clientKey);
  const nextCount = (existing?.count ?? 0) + 1;

  if (nextCount >= MAX_FAILED_ATTEMPTS) {
    failedAttempts.set(clientKey, {
      count: nextCount,
      lockedUntil: Date.now() + LOCKOUT_WINDOW_MS,
    });
    return;
  }

  failedAttempts.set(clientKey, {
    count: nextCount,
    lockedUntil: 0,
  });
}

function clearFailedAttempts(clientKey: string) {
  failedAttempts.delete(clientKey);
}

/**
 * Verify an admin passcode. Uses env var ADMIN_PASSCODE first,
 * falls back to database credential.
 */
export async function verifyAdminPasscode(
  passcode: string,
  clientIp?: string | null,
): Promise<boolean> {
  const clientKey = getClientKey(clientIp ?? null);
  assertNotRateLimited(clientKey);

  const isDev = process.env.NODE_ENV !== "production";

  try {
    // Check env var first
    const adminPasscode = process.env.ADMIN_PASSCODE;
    if (adminPasscode && passcode === adminPasscode) {
      clearFailedAttempts(clientKey);
      return true;
    }

    // Fallback to database credential
    if (isDev) console.log("[ADMIN AUTH] Starting admin passcode verification");

    const credential = await prisma.adminCredential.findFirst();

    if (!credential) {
      if (isDev) console.error("[ADMIN AUTH] No admin credential found in database");
      recordFailedAttempt(clientKey);
      return false;
    }

    const isValid = await bcrypt.compare(passcode, credential.passcodeHash);
    if (isDev) console.log("[ADMIN AUTH] Passcode comparison result:", isValid);

    if (!isValid) {
      recordFailedAttempt(clientKey);
      return false;
    }

    clearFailedAttempts(clientKey);
    return true;
  } catch (error) {
    if (isDev) {
      console.error("[ADMIN AUTH] Error verifying admin passcode:", error instanceof Error ? error.message : "Unknown error");
    }
    recordFailedAttempt(clientKey);
    return false;
  }
}

export async function updateAdminPasscode(passcode: string): Promise<void> {
  const passcodeHash = await bcrypt.hash(passcode, 10);
  const existingCredential = await prisma.adminCredential.findFirst();

  if (existingCredential) {
    await prisma.adminCredential.update({
      where: { id: existingCredential.id },
      data: { passcodeHash },
    });
    return;
  }

  await prisma.adminCredential.create({
    data: { passcodeHash },
  });
}

/**
 * Create a legacy admin session cookie.
 * NOTE: The primary session is now in lib/auth.ts with role-based tokens.
 * This is kept for backward compatibility.
 */
export async function createAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionToken = createAdminSessionToken({ authenticated: true });

  // Remove legacy cookie scoped to /admin so API routes receive the session cookie.
  cookieStore.delete({
    name: ADMIN_SESSION_COOKIE_NAME,
    path: "/admin",
  });

  cookieStore.set(ADMIN_SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ADMIN_SESSION_MAX_AGE,
    path: "/",
  });
}

export async function getAdminSession(): Promise<AdminSessionData | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(ADMIN_SESSION_COOKIE_NAME);

  if (!sessionToken) {
    return null;
  }

  return verifyAdminSessionToken(sessionToken.value);
}

/**
 * Require an admin session. Checks both the unified session (role-based)
 * and the legacy admin session cookie for backward compatibility.
 */
export async function requireAdminSession(): Promise<AdminSessionData> {
  // First check the unified session with role
  try {
    const { getSession } = await import("./auth");
    const session = await getSession();
    if (session && session.authenticated && session.role === "ADMIN") {
      return { authenticated: true };
    }
  } catch {
    // If unified auth module not available, fall through to legacy
  }

  // Fallback to legacy admin session
  const session = await getAdminSession();
  if (!session) {
    throw new AdminAuthError("Unauthorized", 401);
  }

  return session;
}

export async function clearAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete({
    name: ADMIN_SESSION_COOKIE_NAME,
    path: "/",
  });
  cookieStore.delete({
    name: ADMIN_SESSION_COOKIE_NAME,
    path: "/admin",
  });
}
