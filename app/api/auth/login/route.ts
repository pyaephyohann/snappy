import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSession, verifyPasscode } from '@/lib/auth';

const isDev = process.env.NODE_ENV !== 'production';

const loginSchema = z.object({
  username: z
    .string()
    .min(2, 'Username must be at least 2 characters')
    .max(50, 'Username must be less than 50 characters')
    .trim(),
  passcode: z
    .string()
    .min(4, 'Passcode must be at least 4 characters')
    .max(20, 'Passcode must be less than 20 characters'),
});

export async function POST(request: NextRequest) {
  try {
    if (isDev) console.log('[AUTH LOGIN] Starting login request');

    const body = await request.json();

    // Validate request body
    const validationResult = loginSchema.safeParse(body);

    if (!validationResult.success) {
      if (isDev) console.log('[AUTH LOGIN] Validation failed:', validationResult.error);
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 },
      );
    }

    const { username, passcode } = validationResult.data;
    if (isDev) console.log('[AUTH LOGIN] Username provided:', username);

    // Authentication is passcode-only. The username is a free-form display
    // value — any username + correct passcode succeeds.
    const valid = await verifyPasscode(passcode);

    if (!valid) {
      if (isDev) console.log('[AUTH LOGIN] Invalid passcode for username:', username);
      return NextResponse.json(
        { error: 'Invalid passcode. Please try again.' },
        { status: 401 },
      );
    }

    // Create session with the username the user typed
    if (isDev) console.log('[AUTH LOGIN] Creating session for:', username);
    await createSession(username);
    if (isDev) console.log('[AUTH LOGIN] Session created successfully');

    return NextResponse.json(
      { success: true, message: 'Authentication successful' },
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
