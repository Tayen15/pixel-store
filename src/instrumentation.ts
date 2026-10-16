/**
 * Next.js Server Lifecycle Instrumentation Hook.
 * Automatically runs once on server startup.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { startAutoCatalogSyncScheduler } = await import('@/lib/catalog/service');
      startAutoCatalogSyncScheduler(5 * 60 * 1000); // Recurring 5-minute background auto-sync
    } catch (err) {
      console.warn('[Instrumentation] Failed to register catalog sync scheduler:', err);
    }
  }
}
