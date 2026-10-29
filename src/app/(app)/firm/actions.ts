'use server';
import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SETTINGS_DEFAULTS, type Settings } from '@/lib/constants';
import { rescanIfNeeded, runIntake } from '@/lib/intake';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyFirmUpdate, notifyNewRequest, sendDepositRequest, sendLetterTo, sendSummons } from '@/lib/notify';
import { appUrl } from '@/lib/mail';
import { extractDetails, type Extracted } from '@/lib/extract';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The caller's own case (row level security decides what a referrer can see). */
async function ownCase(id: string) {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const [{ data: a }, { data: s }] = await Promise.all([
    supabase.from('appointments').select('id, status, created_at, details_at, extract_status').eq('id', id).maybeSingle(),
    supabase.from('settings').select('*').eq('id', 1).maybeSingle(),
  ]);
  if (!a) return null;
  return { status: a.status as string, createdAt: a.created_at as string, detailsAt: a.details_at as string | null, extractStatus: a.extract_status as string, settings: { ...SETTINGS_DEFAULTS, ...(s as Settings | null) } as Settings };
}

/** Right after a referrer books: tell the doctor, send the summons if no approval is needed, and scan the documents. */
export async function afterBooking(id: string): Promise<{ ok: boolean }> {
  const c = await ownCase(id);
  // only right after the booking itself (the action can be called directly, so it must not repeat work)
  if (!c || Date.now() - new Date(c.createdAt).getTime() > 15 * 60_000) return { ok: false };
  const { data: existing } = await createAdminClient().from('case_intake').select('appointment_id').eq('appointment_id', id).maybeSingle();
  const { data: staff } = await (await createClient()).rpc('is_staff');
  // a patient's own account: how to pay the deposit that holds the slot
  if (!staff) after(() => sendDepositRequest(id, `${appUrl()}/firm/cases/${id}`).then(() => undefined, () => undefined));
  // a referrer books the time first; the doctor is told once the details are in (afterDetails)
  if (!c.detailsAt) return { ok: true };
  after(async () => {
    if (!staff) await notifyNewRequest(id).catch(() => undefined);
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

/** Reads the uploaded documents with AI and returns the patient's details, for the referrer to check and confirm. */
export async function extractFromDocs(id: string): Promise<{ ok: true; data: Extracted } | { ok: false; error: string }> {
  const c = await ownCase(id);
  if (!c) return { ok: false, error: 'התיק לא נמצא.' };
  if (c.status === 'cancelled' || c.status === 'done') return { ok: false, error: 'אי אפשר לשנות את התיק הזה.' };
  // one scan at a time, and a bounded number per case
  const { count } = await createAdminClient().from('audit_log').select('id', { count: 'exact', head: true }).eq('entity_id', id).eq('action', 'ai_extract');
  if ((count ?? 0) >= 8) return { ok: false, error: 'הגעתם למספר הסריקות לתיק. מלאו את הפרטים ידנית.' };
  if (c.extractStatus === 'running') return { ok: false, error: 'הסריקה כבר רצה. נסו שוב בעוד דקה.' };
  const { data: me } = await (await createClient()).auth.getClaims();
  await createAdminClient().from('audit_log').insert({ user_id: me?.claims?.sub ?? null, action: 'ai_extract', entity: 'appointment', entity_id: id });
  return extractDetails(id);
}

/** After the referrer confirmed the details: tell the doctor, send the summons, brief the doctor and draft the letter. */
export async function afterDetails(id: string, first: boolean): Promise<{ ok: boolean }> {
  const c = await ownCase(id);
  if (!c || !c.detailsAt) return { ok: false };
  // the first completion only, and only right after it
  if (!first || Date.now() - new Date(c.detailsAt).getTime() > 15 * 60_000) return { ok: true };
  const { data: staff } = await (await createClient()).rpc('is_staff');
  // the action can be called directly: the scan and the draft run once per case
  const { data: existing } = await createAdminClient().from('case_intake').select('appointment_id').eq('appointment_id', id).maybeSingle();
  if (existing) return { ok: true };
  after(async () => {
    if (!staff) await notifyNewRequest(id).catch(() => undefined);
    if (c.status === 'booked') await sendSummons(id).catch(() => undefined);
    if (c.settings.auto_intake) await runIntake(id).catch(() => undefined);
  });
  return { ok: true };
}

/** The referrer sends the finished letter to another address (an insurer, a colleague). */
export async function forwardLetter(id: string, email: string): Promise<{ ok: boolean; info: string }> {
  const c = await ownCase(id);
  if (!c) return { ok: false, info: 'התיק לא נמצא.' };
  const r = await sendLetterTo(id, String(email || '').split(/[,;\s]+/), { byReferrer: true });
  return { ok: r.ok, info: r.info };
}
