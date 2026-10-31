import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from './supabase/admin';
import { SETTINGS_DEFAULTS, type Settings } from './constants';
import { ilParts, todayIL } from './dates';
import { appUrl, sendMail } from './mail';
import { loadAppointments } from './queries';
import { released } from './types';
import { labelOf } from './services';
import { dailyDigestEmail, type DigestData } from './emails';
import { sendPaymentReminder } from './notify';

async function settingsOf(db: SupabaseClient): Promise<Settings> {
  const { data } = await db.from('settings').select('*').eq('id', 1).single();
  return { ...SETTINGS_DEFAULTS, ...(data as Settings) };
}

async function staffTo(db: SupabaseClient, s: Settings) {
  if (s.notify_email) return [s.notify_email];
  const { data } = await db.from('profiles').select('email, role').in('role', ['doctor', 'admin']).eq('active', true);
  const rows = (data ?? []) as { email: string; role: string }[];
  const doctors = rows.filter((r) => r.role === 'doctor').map((r) => r.email);
  return (doctors.length ? doctors : rows.map((r) => r.email)).filter(Boolean);
}

/** Cases whose document is ready and still waits for payment. */
async function waitingPayment(db: SupabaseClient, s: Settings) {
  const rows = await loadAppointments(db, { order: 'desc', limit: 3000 });
  const gate = s.letter_requires_payment !== false;
  return rows.filter((r) => r.status === 'done' && !released(r, gate));
}

/** The doctor's morning summary: today's schedule and what waits for him. Once a day. */
export async function sendDailyDigest(opts: { force?: boolean } = {}): Promise<{ ok: boolean; info: string }> {
  const db = createAdminClient();
  const s = await settingsOf(db);
  if (!s.daily_digest && !opts.force) return { ok: true, info: 'כבוי' };
  const today = todayIL();
  const kind = `digest_${today}`;
  if (!opts.force) {
    const { count } = await db.from('email_log').select('id', { count: 'exact', head: true }).eq('kind', kind).eq('status', 'sent');
    if ((count ?? 0) > 0) return { ok: true, info: 'כבר נשלח היום' };
  }
  const to = await staffTo(db, s);
  if (!to.length) return { ok: false, info: 'אין מייל לרופא' };

  const from = new Date(`${today}T00:00:00+02:00`).getTime() - 2 * 3600_000;
  const day = await loadAppointments(db, { from: new Date(from).toISOString(), to: new Date(from + 30 * 3600_000).toISOString(), slotsOnly: true });
  const todays = day.filter((r) => ilParts(r.starts_at).date === today && (r.status === 'booked' || r.status === 'draft' || r.status === 'done'));
  const [{ count: pending }, { count: moves }, waiting, { count: proofs }] = await Promise.all([
    db.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    db.from('reschedule_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    waitingPayment(db, s),
    db.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'done').not('pay_proof_at', 'is', null).is('payment_ok_at', null),
  ]);
  const d: DigestData = {
    date: today,
    today: todays.map((r) => ({ time: ilParts(r.starts_at).time, patient: r.patient_name, service: labelOf(r), referrer: r.firm_name || '', phone: r.mode === 'phone', caseNo: r.case_no })),
    pending: pending ?? 0,
    moves: moves ?? 0,
    waitingCount: waiting.length,
    waitingSum: waiting.reduce((x, r) => x + Math.max(0, r.price - r.paid), 0),
    proofs: proofs ?? 0,
    link: `${appUrl()}/doctor`,
  };
  if (!d.today.length && !d.pending && !d.moves && !d.waitingCount && !opts.force) return { ok: true, info: 'אין מה לדווח' };
  const r = await sendMail(db, null, kind, { to, ...dailyDigestEmail(s, d) });
  return r.ok ? { ok: true, info: 'נשלח' } : { ok: false, info: r.error || 'השליחה נכשלה' };
}

/**
 * Automatic payment reminders: every N days while a ready document waits for payment,
 * at most 3 reminders per case, and never while a transfer confirmation waits for the doctor.
 */
export async function runAutoPayReminders(): Promise<{ sent: number }> {
  const db = createAdminClient();
  const s = await settingsOf(db);
  const every = s.auto_pay_reminder_days || 0;
  if (every <= 0) return { sent: 0 };
  const waiting = await waitingPayment(db, s);
  if (!waiting.length) return { sent: 0 };
  const ids = waiting.map((r) => r.id);
  const [{ data: log }, { data: proof }] = await Promise.all([
    db.from('email_log').select('appointment_id, kind, created_at').in('appointment_id', ids).in('kind', ['letter_awaiting_payment', 'payment_reminder', 'payment_rejected']).eq('status', 'sent'),
    db.from('appointments').select('id').in('id', ids).not('pay_proof_at', 'is', null),
  ]);
  const withProof = new Set(((proof ?? []) as { id: string }[]).map((p) => p.id));
  const last = new Map<string, number>();
  const count = new Map<string, number>();
  for (const l of (log ?? []) as { appointment_id: string; kind: string; created_at: string }[]) {
    last.set(l.appointment_id, Math.max(last.get(l.appointment_id) ?? 0, new Date(l.created_at).getTime()));
    if (l.kind === 'payment_reminder') count.set(l.appointment_id, (count.get(l.appointment_id) ?? 0) + 1);
  }
  let sent = 0;
  for (const r of waiting) {
    const at = last.get(r.id);
    // only cases the payer was already asked to pay, not more than 3 reminders, nothing waiting for review
    if (!at || withProof.has(r.id) || (count.get(r.id) ?? 0) >= 3) continue;
    if (Date.now() - at < every * 86_400_000) continue;
    const res = await sendPaymentReminder(r.id).catch(() => null);
    if (res?.ok) sent++;
    if (sent >= 20) break;
  }
  return { sent };
}
