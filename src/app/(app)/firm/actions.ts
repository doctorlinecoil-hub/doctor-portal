'use server';
import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SETTINGS_DEFAULTS, type Settings } from '@/lib/constants';
import { rescanIfNeeded, runIntake } from '@/lib/intake';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyFirmUpdate, notifyNewRequest, sendSummons } from '@/lib/notify';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The caller's own case (row level security decides what a referrer can see). */
async function ownCase(id: string) {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const [{ data: a }, { data: s }] = await Promise.all([
    supabase.from('appointments').select('id, status, created_at').eq('id', id).maybeSingle(),
    supabase.from('settings').select('*').eq('id', 1).maybeSingle(),
  ]);
  if (!a) return null;
  return { status: a.status as string, createdAt: a.created_at as string, settings: { ...SETTINGS_DEFAULTS, ...(s as Settings | null) } as Settings };
}

/** Right after a referrer books: tell the doctor, send the summons if no approval is needed, and scan the documents. */
export async function afterBooking(id: string): Promise<{ ok: boolean }> {
  const c = await ownCase(id);
  // only right after the booking itself (the action can be called directly, so it must not repeat work)
  if (!c || Date.now() - new Date(c.createdAt).getTime() > 15 * 60_000) return { ok: false };
  const { data: existing } = await createAdminClient().from('case_intake').select('appointment_id').eq('appointment_id', id).maybeSingle();
  after(async () => {
    await notifyNewRequest(id).catch(() => undefined);
    if (c.status === 'booked') await sendSummons(id).catch(() => undefined);
    if (c.settings.auto_intake && !existing) await runIntake(id).catch(() => undefined);
  });
  return { ok: true };
}

/** A referrer added notes or documents to a case: tell the doctor, and re-scan when documents were added. */
export async function afterCaseUpdate(id: string, what: { notes: number; files: number }): Promise<{ ok: boolean }> {
  const c = await ownCase(id);
  if (!c) return { ok: false };
  // only real, recent additions trigger emails and a re-scan
  const supabase = await createClient();
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const [{ count: n }, { count: f }] = await Promise.all([
    supabase.from('case_notes').select('id', { count: 'exact', head: true }).eq('appointment_id', id).gte('created_at', since),
    supabase.from('documents').select('id', { count: 'exact', head: true }).eq('appointment_id', id).gte('created_at', since),
  ]);
  const w = { notes: Math.min(n ?? 0, Math.max(0, Math.round(+what.notes || 0))), files: Math.min(f ?? 0, Math.max(0, Math.round(+what.files || 0))) };
  if (!w.notes && !w.files) return { ok: false };
  after(async () => {
    await notifyFirmUpdate(id, w).catch(() => undefined);
    if (w.files && c.settings.auto_intake && c.status !== 'cancelled') await rescanIfNeeded(id).catch(() => undefined);
  });
  return { ok: true };
}
