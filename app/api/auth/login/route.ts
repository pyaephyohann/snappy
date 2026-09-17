import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  authenticatePasscode,
  createSession,
  getAdminUuid,
} from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const isDev = process.env.NODE_ENV !== 'production';

const loginSchema = z.object({
  passcode: z
    .string()
    .min(4, 'Passcode must be at least 4 characters')
    .max(128, 'Passcode must be less than 128 characters'),
});

export async function POST(request: NextRequest) {
  try {
    if (isDev) console.log('[AUTH LOGIN] Starting login request');

    const body = await request.json();
    const validationResult = loginSchema.safeParse(body);

    if (!validationResult.success) {
      if (isDev) console.log('[AUTH LOGIN] Validation failed:', validationResult.error);
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 },
      );
    }

    const { passcode } = validationResult.data;
    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip');

    const authResult = await authenticatePasscode(passcode, clientIp);

    if (!authResult.valid) {
      if (isDev) console.log('[AUTH LOGIN] Invalid passcode');
      return NextResponse.json(
        { error: 'Invalid passcode.' },
        { status: 401 },
      );
    }

    if (authResult.role === 'ADMIN') {
      if (isDev) console.log('[AUTH LOGIN] Admin session');
      await createSession('Admin', 'ADMIN');

      const adminUuid = getAdminUuid();
      const redirectTo = adminUuid ? `/admin/${adminUuid}` : '/home';

      return NextResponse.json(
        { success: true, role: 'ADMIN', redirectTo },
        { status: 200 },
      );
    }

    if (isDev) console.log('[AUTH LOGIN] User session:', authResult.userId);
    await createSession(authResult.username, 'USER', authResult.userId);

    await prisma.user.update({
      where: { id: authResult.userId },
      data: { lastLoginAt: new Date() },
    });

    return NextResponse.json(
      { success: true, role: 'USER', redirectTo: '/home' },
      { status: 200 },
    );
  } catch (error) {
    if (isDev) {
      console.error('[AUTH LOGIN] Error:', error instanceof Error ? error.message : 'Unknown error');
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
