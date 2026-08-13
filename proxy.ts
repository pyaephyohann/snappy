import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';

export default async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Protect /home and /friends routes (user app only)
  if (path.startsWith('/home') || path.startsWith('/friends')) {
    const session = await getSession();

    if (!session) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/home/:path*', '/friends/:path*'],
};
