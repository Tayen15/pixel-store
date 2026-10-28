/**
 * Next.js Server Lifecycle Instrumentation Hook.
 * Automatically runs once on server startup.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Background auto-sync is disabled by default to allow Neon database auto-suspend (scale-to-zero)
    if (process.env.ENABLE_BACKGROUND_CATALOG_SYNC === 'true') {
      try {
        const { startAutoCatalogSyncScheduler } = await import('@/lib/catalog/service');
        startAutoCatalogSyncScheduler(15 * 60 * 1000);
      } catch (err) {
        console.warn('[Instrumentation] Failed to register catalog sync scheduler:', err);
      }
    } else {
      console.log('[Instrumentation] Background catalog sync scheduler disabled to protect Neon compute allowance.');
    }
  }
}
