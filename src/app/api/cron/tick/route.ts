import { runTick } from '@/lib/notify';
import { cleanupTmpUploads } from '@/lib/tmpUploads';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendBackup } from '@/lib/backup';
import { ilParts } from '@/lib/dates';
import { runAutoPayReminders, sendDailyDigest } from '@/lib/daily';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/*
 * Every few minutes: reminders (3 days and 2 hours before), expired deposit holds.
 * Called by the database's scheduler (pg_cron) with its own key, or by Vercel Cron with CRON_SECRET.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = req.headers.get('x-cron-key') || url.searchParams.get('key') || '';
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
  // every evening at 21:00 (Israel time): the backup and the doctor's daily summary, once each
  const hour = Number(ilParts(new Date()).time.slice(0, 2));
  const backup = hour === 21 ? await sendBackup().catch((e) => ({ ok: false, info: String((e as Error)?.message ?? e) })) : null;
  // the doctor's daily summary (21:00) and automatic payment reminders (10:00), once a day each
  const digest = hour === 21 ? await sendDailyDigest().catch((e) => ({ ok: false, info: String((e as Error)?.message ?? e) })) : null;
  const payReminders = hour === 10 && minute < 10 ? await runAutoPayReminders().catch(() => ({ sent: -1 })) : null;
  return Response.json({ ...r, tmpRemoved, backup, digest, payReminders });
}
