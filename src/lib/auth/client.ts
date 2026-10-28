'use client';

/**
 * Authentication Client Instance.
 * Native Next.js OAuth and session client.
 */
export const authClient = {
  signIn: {
    social: async ({ provider, callbackURL }: { provider: string; callbackURL?: string }) => {
      if (typeof window !== 'undefined') {
        const targetCallback = callbackURL || window.location.pathname || '/';
        const authUrl = `/api/auth/${encodeURIComponent(provider)}?callbackURL=${encodeURIComponent(targetCallback)}`;
        window.location.href = authUrl;
      }
    },
  },
  signOut: async () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/api/auth/sign-out';
    }
    return { success: true };
  },
  getSession: async () => {
    return { data: null };
  },
};
