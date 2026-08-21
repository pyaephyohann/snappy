import { cookies } from 'next/headers';
import { prisma } from './prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const SESSION_COOKIE_NAME = 'snappy_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

/**
 * Returns the HMAC secret used to sign session tokens.
 *
 * CRITICAL: AUTH_SECRET **must** be set in every environment (Vercel, CI, etc.).
 * The old fallback to a hardcoded dev secret meant that production sessions
 * were signed with a value visible in the public source code, making
 * token forgery trivial.
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

export interface SessionData {
  username: string;
  authenticated: boolean;
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
    };
  } catch {
    return null;
  }
}

export async function createSession(username: string): Promise<void> {
  const cookieStore = await cookies();

  const sessionData: SessionData = {
    username,
    authenticated: true,
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

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Verify a passcode against the shared access credential.
 *
 * Authentication is passcode-only: the username is a free-form display
 * value that does NOT affect authentication success or failure.
 * Any username + correct passcode → authenticated.
 */
export async function verifyPasscode(
  passcode: string,
): Promise<boolean> {
  const isDev = process.env.NODE_ENV !== 'production';

  const credential = await prisma.accessCredential.findFirst();
  if (!credential) {
    if (isDev) console.error('[AUTH] No access credential found in database');
    return false;
  }

  const isValid = await bcrypt.compare(passcode, credential.passcodeHash);
  if (isDev) console.log('[AUTH] Passcode verification:', isValid ? 'valid' : 'invalid');

  return isValid;
}

export async function updateSharedPasscode(passcode: string): Promise<void> {
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
