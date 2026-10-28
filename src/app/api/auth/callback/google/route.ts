import { NextRequest, NextResponse } from 'next/server';
import { findOrCreateOAuthUser, createUserSession, USER_COOKIE_NAME } from '@/lib/auth/user';
import { createAdminSessionToken, ADMIN_COOKIE_NAME } from '@/lib/auth/admin';

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
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const stateEncoded = searchParams.get('state');
  const error = searchParams.get('error');

  const savedState = request.cookies.get('pixel_oauth_state')?.value;

  // Decode state payload to retrieve callbackURL
  let callbackURL = '/';
  let stateValid = false;

  if (stateEncoded) {
    try {
      const decoded = JSON.parse(Buffer.from(stateEncoded, 'base64url').toString('utf8'));
      callbackURL = decoded.callbackURL || '/';
      if (savedState && decoded.state === savedState) {
        stateValid = true;
      }
    } catch {
      stateValid = false;
    }
  }

  // Handle Google OAuth error or user rejection
  if (error || !code) {
    const redirectUrl = new URL(callbackURL, request.url);
    redirectUrl.searchParams.set('auth_error', error || 'oauth_cancelled');
    return NextResponse.redirect(redirectUrl.toString());
  }

  // Verify CSRF state
  if (!stateValid) {
    const redirectUrl = new URL(callbackURL, request.url);
    redirectUrl.searchParams.set('auth_error', 'invalid_oauth_state');
    return NextResponse.redirect(redirectUrl.toString());
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    const redirectUrl = new URL(callbackURL, request.url);
    redirectUrl.searchParams.set('auth_error', 'missing_google_credentials');
    return NextResponse.redirect(redirectUrl.toString());
  }

  const redirectUri = getRedirectUri(request);

  try {
    // 1. Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('[Google OAuth] Token exchange error:', errText);
      const redirectUrl = new URL(callbackURL, request.url);
      redirectUrl.searchParams.set('auth_error', 'token_exchange_failed');
      return NextResponse.redirect(redirectUrl.toString());
    }

    const tokens = (await tokenRes.json()) as {
      access_token?: string;
      id_token?: string;
      expires_in?: number;
    };

    if (!tokens.access_token) {
      throw new Error('Access token tidak diterima dari Google.');
    }

    // 2. Fetch user profile from Google UserInfo endpoint
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    if (!profileRes.ok) {
      throw new Error('Gagal mengambil data profil dari Google API.');
    }

    const profile = (await profileRes.json()) as {
      sub: string;
      email: string;
      name?: string;
      picture?: string;
      email_verified?: boolean;
    };

    if (!profile.email) {
      throw new Error('Email akun Google tidak tersedia.');
    }

    // 3. Find or create user in Heroku PostgreSQL
    const user = await findOrCreateOAuthUser({
      email: profile.email,
      name: profile.name || profile.email.split('@')[0],
      provider: 'google',
    });

    // 4. Create active user session (valid for 30 days)
    const { token: sessionToken } = await createUserSession(user.id);

    // 5. Construct success response & set HTTP-Only cookies
    let destinationUrl: URL;
    try {
      destinationUrl = new URL(callbackURL, request.url);
    } catch {
      destinationUrl = new URL('/', request.url);
    }

    // Guard: Non-admin trying to access admin panel via Google OAuth
    if (destinationUrl.pathname.startsWith('/admin') && user.role !== 'admin') {
      const forbiddenUrl = new URL('/admin/login', request.url);
      forbiddenUrl.searchParams.set('auth_error', 'forbidden_not_admin');
      const response = NextResponse.redirect(forbiddenUrl.toString());
      response.cookies.delete('pixel_oauth_state');
      return response;
    }

    const response = NextResponse.redirect(destinationUrl.toString());

    // Set Customer session cookie
    response.cookies.set(USER_COOKIE_NAME, sessionToken, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      secure: process.env.NODE_ENV === 'production',
    });

    // If user is Admin, also set Admin session cookie
    if (user.role === 'admin') {
      const adminToken = createAdminSessionToken({ id: user.id, email: user.email });
      response.cookies.set(ADMIN_COOKIE_NAME, adminToken, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60, // 7 days
        secure: process.env.NODE_ENV === 'production',
      });
    }

    // Clear CSRF state cookie
    response.cookies.delete('pixel_oauth_state');

    return response;
  } catch (err) {
    console.error('[Google OAuth] Callback handling failed:', err);
    const redirectUrl = new URL(callbackURL, request.url);
    redirectUrl.searchParams.set('auth_error', 'authentication_failed');
    return NextResponse.redirect(redirectUrl.toString());
  }
}
