import { NextResponse, type NextRequest } from 'next/server';
import { processAuthMiddleware, DEFAULT_AUTH_SKIP_ROUTES } from '@neondatabase/auth/server';

const baseUrl = process.env.NEON_AUTH_BASE_URL || 'https://ep-steep-mode-b38excf1.neonauth.c-4.ap-southeast-1.aws.neon.tech/neondb/auth';
const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET || 'QVuH5N4oxfaRA9ISBBQyZt0zesd7aAO7NPSFPMXL9UE=';

// Routes that do NOT require forced redirect to login (storefront, guest lookup, public info, webhooks)
const PUBLIC_SKIP_ROUTES = [
  ...DEFAULT_AUTH_SKIP_ROUTES,
  '/',
  '/user',
  '/support',
  '/privacy',
  '/terms',
  '/reset-password',
  '/api',
  '/webhook',
];

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  try {
    const result = await processAuthMiddleware({
      request,
      pathname,
      skipRoutes: PUBLIC_SKIP_ROUTES,
      loginUrl: '/user',
      baseUrl,
      cookieSecret,
      sameSite: 'lax',
    });

    switch (result.action) {
      case 'allow': {
        const headers = new Headers(request.headers);
        if (result.headers) {
          for (const [key, value] of Object.entries(result.headers)) {
            headers.set(key, value);
          }
        }
        const response = NextResponse.next({ request: { headers } });
        if (result.cookies) {
          for (const cookie of result.cookies) {
            response.headers.append('Set-Cookie', cookie);
          }
        }
        return response;
      }
      case 'redirect_oauth': {
        const redirectRes = NextResponse.redirect(result.redirectUrl);
        if (result.cookies) {
          for (const cookie of result.cookies) {
            redirectRes.headers.append('Set-Cookie', cookie);
          }
        }
        return redirectRes;
      }
      case 'redirect_login': {
        const loginRes = NextResponse.redirect(result.redirectUrl);
        if (result.cookies) {
          for (const cookie of result.cookies) {
            loginRes.headers.append('Set-Cookie', cookie);
          }
        }
        return loginRes;
      }
    }
  } catch (err) {
    console.warn('[proxy] Auth processing warning:', (err as Error).message);
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
