import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from './supabase/admin';
import { SETTINGS_DEFAULTS, ils, type ReferralType, type Settings } from './constants';
import { ilParts, todayIL, dayNum } from './dates';
import { alreadySent, appUrl, sendMail } from './mail';
import { icsFile, type ApptInfo } from './messages';
import {
  awaitingPaymentEmail, clinicOf, declinedEmail, docRequestEmail, firmUpdateEmail, letterEmail, newRequestEmail, reminderEmail, summonsEmail,
} from './emails';
import { letterFileName, letterHtml, renderPdf } from './pdf';

/*
 * Who gets which email. Runs with the service key, so every caller must check permissions first.
 * The referrer's address = the emails its users sign in with, plus the office email on the referrer card.
 */

type Appt = {
  id: string; case_no: number; starts_at: string; ends_at: string; referral_type: ReferralType; status: string;
  patient_name: string; patient_id_number: string; patient_dob: string | null; patient_email: string; patient_phone: string;
  price: number; firm_id: string; decline_reason: string; reminder_sent_at: string | null; letter_sent_at: string | null;
  firm: { name: string; email: string } | null;
};

export type NotifyResult = { ok: boolean; sent: number; info: string };

async function settingsOf(db: SupabaseClient): Promise<Settings> {
  const { data } = await db.from('settings').select('*').eq('id', 1).single();
  return { ...SETTINGS_DEFAULTS, ...(data as Settings) };
}

async function load(db: SupabaseClient, id: string) {
  const [{ data }, s] = await Promise.all([
    db.from('appointments').select('*, firm:firms(name, email)').eq('id', id).maybeSingle(),
    settingsOf(db),
  ]);
  return { a: data as Appt | null, s };
}

function info(a: Appt): ApptInfo {
  const minutes = Math.max(10, Math.round((new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60000));
  return { caseNo: a.case_no, startsAt: a.starts_at, minutes, type: a.referral_type, patientName: a.patient_name, firmName: a.firm?.name || '' };
}

async function firmEmails(db: SupabaseClient, firmId: string, office?: string | null) {
  const { data } = await db.from('profiles').select('email').eq('firm_id', firmId).eq('role', 'firm').eq('active', true);
  return [...(data ?? []).map((r) => r.email as string), office || ''].filter(Boolean);
}

async function staffEmails(db: SupabaseClient, s: Settings) {
  if (s.notify_email) return [s.notify_email];
  const { data } = await db.from('profiles').select('email, role').in('role', ['doctor', 'admin']).eq('active', true);
  const rows = data ?? [];
  const doctors = rows.filter((r) => r.role === 'doctor').map((r) => r.email as string);
  return doctors.length ? doctors : rows.map((r) => r.email as string);
}

const caseLink = (id: string, staff: boolean) => `${appUrl()}/${staff ? 'doctor' : 'firm'}/cases/${id}`;

/** To the doctor, when a referrer books. */
export async function notifyNewRequest(id: string): Promise<NotifyResult> {
  const db = createAdminClient();
  const { a, s } = await load(db, id);
  if (!a) return { ok: false, sent: 0, info: 'התיק לא נמצא' };
  if (await alreadySent(db, id, 'new_request')) return { ok: true, sent: 0, info: 'כבר נשלח' };
  const m = newRequestEmail(s, info(a), caseLink(id, true), a.status === 'pending');
  const r = await sendMail(db, id, 'new_request', { to: await staffEmails(db, s), ...m });
  return { ok: r.ok, sent: r.ok ? 1 : 0, info: r.error || '' };
}

/** The summons, after approval (or right away when approval is off). */
export async function sendSummons(id: string, opts: { force?: boolean } = {}): Promise<NotifyResult> {
  const db = createAdminClient();
  const { a, s } = await load(db, id);
  if (!a) return { ok: false, sent: 0, info: 'התיק לא נמצא' };
  if (!['booked', 'draft'].includes(a.status)) return { ok: false, sent: 0, info: 'התור לא מאושר' };
  if (!opts.force && (await alreadySent(db, id, 'summons_firm'))) return { ok: true, sent: 0, info: 'הזימון כבר נשלח' };
  const ai = info(a);
  const ics = icsFile(ai, clinicOf(s), `appt-${a.id}@doctor-portal`);
  const attachments = [{ filename: 'הוספה ליומן.ics', content: ics, contentType: 'text/calendar; charset=utf-8; method=PUBLISH' }];
  let sent = 0;
  const errors: string[] = [];
  const patientHasEmail = !!a.patient_email;
  if (patientHasEmail && (opts.force || !(await alreadySent(db, id, 'summons_patient')))) {
    const m = summonsEmail(s, ai, { forReferrer: false, patientHasEmail });
    const r = await sendMail(db, id, 'summons_patient', { to: [a.patient_email], ...m, attachments });
    if (r.ok) sent++; else if (r.error) errors.push(r.error);
  }
  const m = summonsEmail(s, ai, { forReferrer: true, patientHasEmail, link: caseLink(id, false) });
  const r = await sendMail(db, id, 'summons_firm', { to: await firmEmails(db, a.firm_id, a.firm?.email), ...m, attachments });
  if (r.ok) sent++; else if (r.error) errors.push(r.error);
  return { ok: sent > 0, sent, info: errors[0] || '' };
}

export async function sendDeclined(id: string): Promise<NotifyResult> {
  const db = createAdminClient();
  const { a, s } = await load(db, id);
  if (!a) return { ok: false, sent: 0, info: 'התיק לא נמצא' };
  const m = declinedEmail(s, info(a), a.decline_reason, `${appUrl()}/firm/book`);
  const r = await sendMail(db, id, 'declined', { to: await firmEmails(db, a.firm_id, a.firm?.email), ...m });
  return { ok: r.ok, sent: r.ok ? 1 : 0, info: r.error || '' };
}

export async function sendDocRequest(id: string, items: string[], note: string): Promise<NotifyResult> {
  const db = createAdminClient();
  const { a, s } = await load(db, id);
  if (!a) return { ok: false, sent: 0, info: 'התיק לא נמצא' };
  const m = docRequestEmail(s, info(a), items, note, caseLink(id, false));
  const r = await sendMail(db, id, 'doc_request', { to: await firmEmails(db, a.firm_id, a.firm?.email), ...m });
  return { ok: r.ok, sent: r.ok ? 1 : 0, info: r.error || '' };
}

export async function notifyFirmUpdate(id: string, what: { notes: number; files: number }): Promise<NotifyResult> {
  const db = createAdminClient();
  const { a, s } = await load(db, id);
  if (!a || (!what.notes && !what.files)) return { ok: false, sent: 0, info: '' };
  const { count } = await db.from('email_log').select('id', { count: 'exact', head: true }).eq('appointment_id', id).eq('kind', 'firm_update')
    .gte('created_at', new Date(Date.now() - 10 * 60_000).toISOString());
  if ((count ?? 0) > 0) return { ok: true, sent: 0, info: 'כבר נשלחה הודעה בדקות האחרונות' };
  const m = firmUpdateEmail(s, info(a), what, caseLink(id, true));
  const r = await sendMail(db, id, 'firm_update', { to: await staffEmails(db, s), ...m });
  return { ok: r.ok, sent: r.ok ? 1 : 0, info: r.error || '' };
}

/** Reminders for tomorrow's appointments. Called once a day by the scheduler. */
export async function sendReminders(): Promise<NotifyResult> {
  const db = createAdminClient();
  const s = await settingsOf(db);
  if (!s.reminders_on) return { ok: true, sent: 0, info: 'תזכורות כבויות' };
  const from = new Date(Date.now() - 2 * 86400000).toISOString();
  const to = new Date(Date.now() + 3 * 86400000).toISOString();
  const { data } = await db.from('appointments').select('*, firm:firms(name, email)')
    .in('status', ['booked', 'draft']).is('reminder_sent_at', null).gte('starts_at', from).lt('starts_at', to);
  const tomorrow = dayNum(todayIL()) + 1;
  let sent = 0;
  for (const a of (data as Appt[] | null) ?? []) {
    if (dayNum(ilParts(a.starts_at).date) !== tomorrow) continue;
    const ai = info(a);
    if (a.patient_email) {
      const r = await sendMail(db, a.id, 'reminder_patient', { to: [a.patient_email], ...reminderEmail(s, ai, false) });
      if (r.ok) sent++;
    }
    const r = await sendMail(db, a.id, 'reminder_firm', { to: await firmEmails(db, a.firm_id, a.firm?.email), ...reminderEmail(s, ai, true) });
    if (r.ok) sent++;
    await db.from('appointments').update({ reminder_sent_at: new Date().toISOString() }).eq('id', a.id);
  }
  return { ok: true, sent, info: '' };
}

/**
 * The final letter as a PDF to the referrer (and the patient, if an email was given).
 * When the letter waits for payment, the referrer gets a "ready, awaiting payment" notice instead,
 * and the letter goes out by itself once the payment is recorded.
 */
export async function deliverLetter(id: string, opts: { force?: boolean; onlyIfAwaitingPayment?: boolean } = {}): Promise<NotifyResult> {
  const db = createAdminClient();
  const { a, s } = await load(db, id);
  if (!a) return { ok: false, sent: 0, info: 'התיק לא נמצא' };
  if (opts.onlyIfAwaitingPayment && !(await alreadySent(db, id, 'letter_awaiting_payment'))) return { ok: true, sent: 0, info: '' };
  if (!s.email_letters && !opts.force) return { ok: true, sent: 0, info: 'שליחת מכתבים במייל כבויה בהגדרות' };
  if (a.letter_sent_at && !opts.force) return { ok: true, sent: 0, info: 'המכתב כבר נשלח' };
  const { data: l } = await db.from('letters').select('*').eq('appointment_id', id).maybeSingle();
  if (!l?.is_final || !l.final_body) return { ok: false, sent: 0, info: 'אין מכתב סופי' };

  const { data: pays } = await db.from('payments').select('amount').eq('appointment_id', id);
  const paid = (pays ?? []).reduce((x, p) => x + Number(p.amount), 0);
  const price = Number(a.price);
  const firmTo = await firmEmails(db, a.firm_id, a.firm?.email);
  const ai = info(a);
  ai.type = (l.final_letter_type || l.letter_type) as ReferralType;

  if (s.letter_requires_payment && paid + 0.001 < price) {
    if (!(await alreadySent(db, id, 'letter_awaiting_payment'))) {
      const m = awaitingPaymentEmail(s, ai, ils(price - paid), caseLink(id, false));
      await sendMail(db, id, 'letter_awaiting_payment', { to: firmTo, ...m });
    }
    return { ok: true, sent: 0, info: 'המכתב ממתין לתשלום. הוא יישלח לבד כשהתשלום יירשם.' };
  }

  const doc = { letter_type: ai.type, recipient: l.final_recipient || '', subject: l.final_subject || '', body: l.final_body, letter_date: l.letter_date || todayIL() };
  const pt = { name: a.patient_name, idNumber: a.patient_id_number, dob: a.patient_dob };
  const pdf = await renderPdf(letterHtml(s, doc, pt), [s.lh_name, s.lh_address].filter(Boolean).join(' · '));
  const attachments = pdf ? [{ filename: letterFileName(doc, pt), content: pdf, contentType: 'application/pdf' }] : undefined;

  let sent = 0;
  const r1 = await sendMail(db, id, 'letter_firm', { to: firmTo, ...letterEmail(s, ai, { forReferrer: true, attached: !!pdf, link: caseLink(id, false) }), attachments });
  if (r1.ok) sent++;
  // the patient has no portal account, so they only get the letter when it can be attached
  if (a.patient_email && pdf) {
    const r2 = await sendMail(db, id, 'letter_patient', { to: [a.patient_email], ...letterEmail(s, ai, { forReferrer: false, attached: true }), attachments });
    if (r2.ok) sent++;
  }
  if (sent) await db.from('appointments').update({ letter_sent_at: new Date().toISOString() }).eq('id', id);
  return {
    ok: sent > 0,
    sent,
    info: sent ? (pdf ? `המכתב נשלח במייל כ־PDF (${sent === 2 ? 'למפנה ולמטופל' : 'למפנה'})` : 'נשלח מייל למפנה עם קישור למכתב') : r1.error || 'השליחה נכשלה',
  };
}
