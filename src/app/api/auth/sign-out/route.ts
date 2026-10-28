import { NextRequest, NextResponse } from 'next/server';
import { USER_COOKIE_NAME, deleteUserSession } from '@/lib/auth/user';
import { ADMIN_COOKIE_NAME } from '@/lib/auth/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get(USER_COOKIE_NAME)?.value;
  if (sessionToken) {
    try {
      await deleteUserSession(sessionToken);
    } catch {}
  }

  const { searchParams } = new URL(request.url);
  const callbackURL = searchParams.get('callbackURL') || '/';

  const response = NextResponse.redirect(new URL(callbackURL, request.url));
  response.cookies.delete(USER_COOKIE_NAME);
  response.cookies.delete(ADMIN_COOKIE_NAME);
  return response;
}

