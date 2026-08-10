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
    console.log('Login attempt - checking environment...');
    console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
    console.log('AUTH_SECRET exists:', !!process.env.AUTH_SECRET);

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

    console.log('Attempting passcode verification...');
    // Verify passcode
    const isValidPasscode = await verifyPasscode(passcode);
    console.log('Passcode verification completed, result:', isValidPasscode);

    if (!isValidPasscode) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    console.log('Creating session...');
    // Create session
    await createSession(username);
    console.log('Session created successfully');

    return NextResponse.json(
      { success: true, message: 'Authentication successful' },
      { status: 200 }
    );

  } catch (error) {
    console.error('Login error details:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
