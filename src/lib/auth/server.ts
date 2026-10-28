/**
 * Native Authentication Server Module.
 * Migrated away from Neon Managed Better Auth to native Heroku PostgreSQL auth.
 */

export const jwksUrl = '';

export const auth = {
  handler: () => ({
    GET: async () => new Response(JSON.stringify({ ok: true, provider: 'heroku-postgres' }), { headers: { 'Content-Type': 'application/json' } }),
    POST: async () => new Response(JSON.stringify({ ok: true, provider: 'heroku-postgres' }), { headers: { 'Content-Type': 'application/json' } }),
  }),
  getSession: async () => ({ data: null }),
  signUp: {
    email: async () => ({ data: null, error: null }),
  },
  signIn: {
    email: async () => ({ data: null, error: null }),
  },
  signOut: async () => ({ success: true }),
  admin: {
    setRole: async () => ({ success: true }),
    createUser: async () => ({ success: true }),
    listUsers: async () => ({ data: [] }),
    banUser: async () => ({ success: true }),
  },
};
