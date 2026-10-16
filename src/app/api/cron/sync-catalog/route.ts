import { NextResponse } from 'next/server';
import { syncRealtimeCatalog } from '@/lib/catalog/service';

export const dynamic = 'force-dynamic';

/**
 * Scheduled Cron / Webhook Endpoint for Catalog Synchronization.
 * Can be called by internal schedulers, Dokploy Cron, Vercel Cron, or uptime bots.
 * URL: /api/cron/sync-catalog
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // Optional bearer secret verification if configured
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      const url = new URL(request.url);
      const queryKey = url.searchParams.get('key');
      if (queryKey !== cronSecret) {
        return NextResponse.json({ success: false, error: 'Unauthorized cron trigger' }, { status: 401 });
      }
    }

    const result = await syncRealtimeCatalog(true);

    return NextResponse.json({
      success: true,
      message: 'Wholesale catalog synchronized successfully',
      productsCount: result.count,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
