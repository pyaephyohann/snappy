import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSession, verifyPasscode } from '@/lib/auth';

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
    console.log('[AUTH LOGIN] Starting login request');
    
    const body = await request.json();

    // Validate request body
    const validationResult = loginSchema.safeParse(body);
    
    if (!validationResult.success) {
      console.log('[AUTH LOGIN] Validation failed:', validationResult.error);
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }

    const { username, passcode } = validationResult.data;
    console.log('[AUTH LOGIN] Username provided:', username);
    console.log('[AUTH LOGIN] DATABASE_URL set:', !!process.env.DATABASE_URL);
    console.log('[AUTH LOGIN] AUTH_SECRET set:', !!process.env.AUTH_SECRET);

    // Verify passcode
    const isValidPasscode = await verifyPasscode(passcode);
    console.log('[AUTH LOGIN] Passcode validation result:', isValidPasscode);

    if (!isValidPasscode) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Create session
    console.log('[AUTH LOGIN] Creating session for user:', username);
    await createSession(username);
    console.log('[AUTH LOGIN] Session created successfully');

    return NextResponse.json(
      { success: true, message: 'Authentication successful' },
      { status: 200 }
    );

  } catch (error) {
    console.error('[AUTH LOGIN] Error:', error instanceof Error ? error.message : 'Unknown error');
    console.error('[AUTH LOGIN] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
