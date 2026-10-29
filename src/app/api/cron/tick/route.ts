import { runTick } from '@/lib/notify';
import { cleanupTmpUploads } from '@/lib/tmpUploads';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/*
 * Every few minutes: reminders (3 days and 2 hours before), expired deposit holds.
 * Called by the database's scheduler (pg_cron) with its own key, or by Vercel Cron with CRON_SECRET.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get('key') || '';
  const secret = process.env.CRON_SECRET;
  let ok = !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
  if (!ok && key) {
    const { data } = await createAdminClient().rpc('cron_key_ok', { p_key: key });
    ok = data === true;
  }
  if (!ok) return new Response('unauthorized', { status: 401 });
  const r = await runTick();
  const minute = new Date().getUTCMinutes();
  const tmpRemoved = minute < 10 ? await cleanupTmpUploads().catch(() => -1) : 0;
  return Response.json({ ...r, tmpRemoved });
}
