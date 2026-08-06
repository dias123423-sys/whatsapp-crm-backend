import { NextRequest, NextResponse } from 'next/server';

// Protect /dashboard routes — redirect to login if no token
export function proxy(req: NextRequest) {
  const token = req.cookies.get('authToken')?.value;
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/dashboard') && !token) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  if (pathname === '/' && token) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/dashboard/:path*'],
};
