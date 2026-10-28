import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function getRedirectUri(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  const proto =
    request.headers.get('x-forwarded-proto') ||
    (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');

  if (host) {
    return `${proto}://${host}/api/auth/callback/google`;
  }
  const fallback = process.env.APP_URL || request.nextUrl.origin;
  return `${fallback.replace(/\/+$/, '')}/api/auth/callback/google`;
}

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();

  if (!clientId) {
    return NextResponse.json(
      {
        error: 'GOOGLE_CLIENT_ID belum dikonfigurasi di file environment (.env).',
      },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const callbackURL = searchParams.get('callbackURL') || '/';

  // Generate random CSRF state
  const randomState = crypto.randomBytes(24).toString('hex');
  const statePayload = Buffer.from(
    JSON.stringify({
      state: randomState,
      callbackURL,
    })
  ).toString('base64url');

  const redirectUri = getRedirectUri(request);

  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.set('client_id', clientId);
  googleAuthUrl.searchParams.set('redirect_uri', redirectUri);
  googleAuthUrl.searchParams.set('response_type', 'code');
  googleAuthUrl.searchParams.set('scope', 'openid email profile');
  googleAuthUrl.searchParams.set('state', statePayload);
  googleAuthUrl.searchParams.set('access_type', 'offline');
  googleAuthUrl.searchParams.set('prompt', 'select_account');

  const response = NextResponse.redirect(googleAuthUrl.toString());

  // Store state in a secure short-lived cookie for validation
  response.cookies.set('pixel_oauth_state', randomState, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 10 * 60, // 10 minutes
    secure: process.env.NODE_ENV === 'production',
  });

  return response;
}

