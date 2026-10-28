import { NextResponse, type NextRequest } from 'next/server';

/**
 * Next.js 16 Proxy Convention Middleware.
 * Replaced external Neon Auth middleware with native Next.js pass-through.
 */
export async function proxy(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
