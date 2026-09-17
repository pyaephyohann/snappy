import { cookies } from 'next/headers';
import crypto from 'crypto';
import { verifyAdminPasscode } from '@/lib/admin-auth';
import { verifyPasscodeHash } from '@/lib/passcode-utils';
import { prisma } from '@/lib/prisma';

const SESSION_COOKIE_NAME = 'snappy_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

/**
 * Returns the HMAC secret used to sign session tokens.
 *
 * CRITICAL: AUTH_SECRET **must** be set in every environment (Vercel, CI, etc.).
 */
function getSessionSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      '[AUTH] FATAL: AUTH_SECRET environment variable is not set. ' +
      'Set a strong, random value in your Vercel environment variables.',
    );
  }
  return secret;
}

export type UserRole = 'USER' | 'ADMIN';

export interface SessionData {
  username: string;
  authenticated: boolean;
  role: UserRole;
  userId?: string;
}

function createSessionToken(data: SessionData): string {
  const secret = getSessionSecret();
  const timestamp = Date.now();
  const payload = JSON.stringify({ ...data, timestamp });
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return Buffer.from(`${payload}.${signature}`).toString('base64');
}

function verifySessionToken(token: string): SessionData | null {
  try {
    const secret = getSessionSecret();
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [payload, signature] = decoded.split('.');

    if (!payload || !signature) {
      return null;
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    if (signature !== expectedSignature) {
      return null;
    }

    const data = JSON.parse(payload) as SessionData & { timestamp: number };

    // Check session age (7 days)
    const sessionAgeMs = Date.now() - data.timestamp;
    if (sessionAgeMs > SESSION_MAX_AGE * 1000) {
      return null;
    }

    return {
      username: data.username,
      authenticated: data.authenticated,
      role: data.role ?? 'USER',
      userId: data.userId,
    };
  } catch {
    return null;
  }
}

export type AuthenticatedAppUser = {
  id: string;
  name: string;
  profileImage: string;
  role: UserRole;
  createdAt: Date;
  lastLoginAt: Date | null;
  profileImageSnap: { id: string; imageUrl: string } | null;
};

/**
 * Create a session with role (USER or ADMIN). User sessions include userId.
 */
export async function createSession(
  username: string,
  role: UserRole = 'USER',
  userId?: string,
): Promise<void> {
  const cookieStore = await cookies();

  const sessionData: SessionData = {
    username,
    authenticated: true,
    role,
    ...(userId ? { userId } : {}),
  };

  const sessionToken = createSessionToken(sessionData);

  cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}

export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME);

  if (!sessionToken) {
    return null;
  }

  return verifySessionToken(sessionToken.value);
}

export async function requireSession(): Promise<SessionData> {
  const session = await getSession();

  if (!session) {
    throw new Error('Unauthorized');
  }

  return session;
}

/**
 * Require an admin session. Returns the session or throws if not admin.
 */
export async function requireAdminSession(): Promise<SessionData> {
  const session = await getSession();

  if (!session || !session.authenticated || session.role !== 'ADMIN') {
    throw new Error('Unauthorized');
  }

  return session;
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export type PasscodeAuthResult =
  | { valid: true; role: 'ADMIN' }
  | { valid: true; role: 'USER'; userId: string; username: string }
  | { valid: false };

/**
 * Authenticate a passcode: admin credential first, then per-user hashed passcodes.
 */
export async function authenticatePasscode(
  passcode: string,
  clientIp?: string | null,
): Promise<PasscodeAuthResult> {
  const isAdmin = await verifyAdminPasscode(passcode, clientIp);
  if (isAdmin) {
    return { valid: true, role: 'ADMIN' };
  }

  const candidates = await prisma.user.findMany({
    where: { passcodeHash: { not: null } },
    select: {
      id: true,
      name: true,
      passcodeHash: true,
      isActive: true,
    },
  });

  for (const user of candidates) {
    if (!user.passcodeHash) continue;
    const matches = await verifyPasscodeHash(passcode, user.passcodeHash);
    if (!matches) continue;

    if (!user.isActive) {
      return { valid: false };
    }

    return {
      valid: true,
      role: 'USER',
      userId: user.id,
      username: user.name,
    };
  }

  return { valid: false };
}

/** @deprecated Use authenticatePasscode */
export async function verifyPasscode(
  passcode: string,
): Promise<{ valid: boolean; role: UserRole; userId?: string; username?: string }> {
  const result = await authenticatePasscode(passcode);
  if (!result.valid) {
    return { valid: false, role: 'USER' };
  }
  if (result.role === 'ADMIN') {
    return { valid: true, role: 'ADMIN' };
  }
  return {
    valid: true,
    role: 'USER',
    userId: result.userId,
    username: result.username,
  };
}

/**
 * Load the logged-in app user from the session (server-side only).
 */
export async function getAuthenticatedAppUser(): Promise<AuthenticatedAppUser | null> {
  const session = await getSession();
  if (!session?.authenticated || session.role !== 'USER') {
    return null;
  }

  // Canonical identity for per-user passcode sessions.
  if (session.userId) {
    const user = await prisma.user.findFirst({
      where: { id: session.userId, isActive: true },
      select: {
        id: true,
        name: true,
        profileImage: true,
        role: true,
        createdAt: true,
        lastLoginAt: true,
        profileImageSnap: { select: { id: true, imageUrl: true } },
      },
    });
    return user;
  }

  // Temporary migration compatibility for pre-userId sessions (max 7-day cookie TTL).
  const user = await prisma.user.findFirst({
    where: { name: session.username, isActive: true },
    select: {
      id: true,
      name: true,
      profileImage: true,
      role: true,
      createdAt: true,
      lastLoginAt: true,
      profileImageSnap: { select: { id: true, imageUrl: true } },
    },
  });

  return user;
}

export async function requireAuthenticatedAppUser(): Promise<AuthenticatedAppUser> {
  const user = await getAuthenticatedAppUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}

/**
 * Get the admin secret route UUID from environment variables.
 */
export function getAdminUuid(): string | null {
  return process.env.ADMIN_SECRET_ROUTE_UUID ?? null;
}

/**
 * Validate that a given UUID matches the admin secret route UUID.
 */
export function isValidAdminUuid(uuid: string): boolean {
  const adminUuid = getAdminUuid();
  if (!adminUuid) return false;
  return uuid === adminUuid;
}
