import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

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
      // Backward compatibility: old tokens without role default to USER
      role: data.role ?? 'USER',
    };
  } catch {
    return null;
  }
}

/**
 * Create a session with role (USER or ADMIN).
 */
export async function createSession(username: string, role: UserRole = 'USER'): Promise<void> {
  const cookieStore = await cookies();

  const sessionData: SessionData = {
    username,
    authenticated: true,
    role,
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

/**
 * Update the shared access passcode in the database.
 * Used by admin API routes when creating/updating users.
 */
export async function updateSharedPasscode(passcode: string): Promise<void> {
  const { prisma } = await import('./prisma');
  const passcodeHash = await bcrypt.hash(passcode, 10);
  const existingCredential = await prisma.accessCredential.findFirst();

  if (existingCredential) {
    await prisma.accessCredential.update({
      where: { id: existingCredential.id },
      data: { passcodeHash },
    });
    return;
  }

  await prisma.accessCredential.create({
    data: { passcodeHash },
  });
}

/**
 * Verify a passcode against environment-variable credentials.
 *
 * The role is determined by which passcode matches:
 *   - USER_PASSCODE → role: USER
 *   - ADMIN_PASSCODE → role: ADMIN
 *
 * Also falls back to database credentials for backward compatibility.
 * Authentication is passcode-only: the username is a free-form display
 * value that does NOT affect authentication success or failure.
 */
export async function verifyPasscode(
  passcode: string,
): Promise<{ valid: boolean; role: UserRole }> {
  const userPasscode = process.env.USER_PASSCODE;
  const adminPasscode = process.env.ADMIN_PASSCODE;

  // Check environment variable passcodes first
  if (adminPasscode && passcode === adminPasscode) {
    return { valid: true, role: 'ADMIN' };
  }

  if (userPasscode && passcode === userPasscode) {
    return { valid: true, role: 'USER' };
  }

  // Fallback: check database credentials (legacy support)
  // This uses dynamic import to avoid bundling Prisma in edge runtime
  try {
    const { prisma } = await import('./prisma');

    // Check user credential
    const credential = await prisma.accessCredential.findFirst();
    if (credential) {
      const isValid = await bcrypt.compare(passcode, credential.passcodeHash);
      if (isValid) {
        return { valid: true, role: 'USER' };
      }
    }

    // Check admin credential
    const adminCredential = await prisma.adminCredential.findFirst();
    if (adminCredential) {
      const isValid = await bcrypt.compare(passcode, adminCredential.passcodeHash);
      if (isValid) {
        return { valid: true, role: 'ADMIN' };
      }
    }
  } catch {
    // If Prisma is not available (e.g., edge runtime), only env vars work
  }

  return { valid: false, role: 'USER' };
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
