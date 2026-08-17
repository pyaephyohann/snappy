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
    const body = await request.json();

    // Validate request body
    const validationResult = loginSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }

    const { username, passcode } = validationResult.data;

    // Verify passcode
    const isValidPasscode = await verifyPasscode(passcode);

    if (!isValidPasscode) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Create session
    await createSession(username);

    return NextResponse.json(
      { success: true, message: 'Authentication successful' },
      { status: 200 }
    );

  } catch (error) {
    console.error('Login error:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
