import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';

export default async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Protect /home and its sub-routes
  if (path.startsWith('/home')) {
    const session = await getSession();

    if (!session) {
      // Redirect to auth page if not authenticated
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // Allow access to auth page and other public routes
  return NextResponse.next();
}

export const config = {
  matcher: ['/home/:path*'],
};
