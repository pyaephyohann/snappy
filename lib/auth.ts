import { cookies } from 'next/headers';
import { prisma } from './prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const SESSION_COOKIE_NAME = 'snappy_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds
const SESSION_SECRET = process.env.AUTH_SECRET || 'dev-secret-change-in-production';

export interface SessionData {
  username: string;
  authenticated: boolean;
}

function createSessionToken(data: SessionData): string {
  const timestamp = Date.now();
  const payload = JSON.stringify({ ...data, timestamp });
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('hex');
  
  return Buffer.from(`${payload}.${signature}`).toString('base64');
}

function verifySessionToken(token: string): SessionData | null {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [payload, signature] = decoded.split('.');
    
    if (!payload || !signature) {
      return null;
    }

    const expectedSignature = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(payload)
      .digest('hex');
    
    if (signature !== expectedSignature) {
      return null;
    }

    const data = JSON.parse(payload) as SessionData & { timestamp: number };
    
    // Check session age (7 days)
    const sessionAge = Date.now() - data.timestamp;
    if (sessionAge > SESSION_MAX_AGE * 1000) {
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

export async function verifyPasscode(passcode: string): Promise<boolean> {
  try {
    const credential = await prisma.accessCredential.findFirst();
    
    if (!credential) {
      return false;
    }

    const result = await bcrypt.compare(passcode, credential.passcodeHash);
    return result;
  } catch (error) {
    throw error;
  }
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
