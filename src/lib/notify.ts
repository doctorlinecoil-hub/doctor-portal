import 'server-only';
import { sendSms, smsEnabled, smsReminderText } from './sms';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from './supabase/admin';
import { SETTINGS_DEFAULTS, ils, isPatientKind, type ReferralType, type Settings } from './constants';
import { ilParts, todayIL } from './dates';
import { alreadySent, appUrl, sendMail } from './mail';
import { icsFile, type ApptInfo } from './messages';
import {
  awaitingPaymentEmail, clinicOf, rxEmail, declinedEmail, depositEmail, depositExpiredEmail, docRequestEmail, firmUpdateEmail, letterEmail, newRequestEmail, reminderEmail, summonsEmail,
  type RemindWhen,
} from './emails';
import { letterFileName, letterHtml, renderPdf } from './pdf';
import { rxHtml } from './rx';
import type { RxItem } from './rxTypes';

/*
 * Who gets which email. Runs with the service key, so every caller must check permissions first.
 * The referrer's address = the emails its users sign in with, plus the office email on the referrer card.
 */

type Appt = {
  id: string; case_no: number; starts_at: string; ends_at: string; referral_type: ReferralType; status: string;
  service_label?: string; patient_name: string; patient_id_number: string; patient_dob: string | null; patient_email: string; patient_phone: string;
  price: number; firm_id: string; walk_in?: boolean; mode?: string; notify_emails?: string[] | null; decline_reason: string; reminder_sent_at: string | null; letter_sent_at: string | null;
  firm: { name: string; email: string; kind?: string } | null;
  deposit_amount?: number; deposit_paid_at?: string | null; deposit_proof_at?: string | null; created_at?: string; source?: string;
  remind_3d_at?: string | null; remind_2h_at?: string | null; upload_key_hash?: string | null;
};

export type NotifyResult = { ok: boolean; sent: number; info: string };

async function settingsOf(db: SupabaseClient): Promise<Settings> {
  const { data } = await db.from('settings').select('*').eq('id', 1).single();
  return { ...SETTINGS_DEFAULTS, ...(data as Settings) };
}

async function load(db: SupabaseClient, id: string) {
  const [{ data }, s] = await Promise.all([
    db.from('appointments').select('*, firm:firms(name, email, kind)').eq('id', id).maybeSingle(),
    settingsOf(db),
  ]);
  return { a: data as Appt | null, s };
}

function info(a: Appt): ApptInfo {
  const minutes = Math.max(10, Math.round((new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60000));
  return { caseNo: a.case_no, startsAt: a.starts_at, minutes, type: a.referral_type, label: a.service_label || '', patientName: a.patient_name, firmName: a.firm?.name || '', phone: a.mode === 'phone', patientPhone: a.patient_phone || '' };
}

/** The referrer's addresses, plus the extra addresses typed when booking (they get the summons and the letters too). */
async function firmEmails(db: SupabaseClient, firmId: string, office?: string | null, extra?: string[] | null) {
  const { data } = await db.from('profiles').select('email').eq('firm_id', firmId).eq('role', 'firm').eq('active', true);
  const all = [...(data ?? []).map((r) => r.email as string), office || '', ...(extra ?? [])].map((e) => String(e || '').trim().toLowerCase()).filter(Boolean);
  return [...new Set(all)];
}

async function staffEmails(db: SupabaseClient, s: Settings) {
  if (s.notify_email) return [s.notify_email];
  const { data } = await db.from('profiles').select('email, role').in('role', ['doctor', 'admin']).eq('active', true);
  const rows = data ?? [];
  const doctors = rows.filter((r) => r.role === 'doctor').map((r) => r.email as string);
  return doctors.length ? doctors : rows.map((r) => r.email as string);
}

const uniq = (l: (string | null | undefined)[]) => [...new Set(l.map((e) => String(e || '').trim().toLowerCase()).filter(Boolean))];

/** Who hears about an appointment: the patient (and a patient's own account), and the referrer with the extra addresses. */
async function audience(db: SupabaseClient, a: Appt) {
  const kind = a.firm?.kind || '';
  const pk = isPatientKind(kind);
  const firmList = kind === 'private' ? [] : await firmEmails(db, a.firm_id, a.firm?.email, null);
  const patient = uniq([a.patient_email, ...(pk ? firmList : [])]);
  const referrer = uniq([...(pk ? [] : firmList), ...(a.notify_emails ?? [])]).filter((e) => !patient.includes(e));
  return { patient, referrer, pk };
}

/** Summons and reminders carry no amounts or payment details: the doctor sends the cost himself. */
async function dueOf(_db: SupabaseClient, _a: Appt): Promise<number> {
  return 0;
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
  const who = await audience(db, a);
  const due = await dueOf(db, a);
  const patientHasEmail = who.patient.length > 0;
  if (patientHasEmail && (opts.force || !(await alreadySent(db, id, 'summons_patient')))) {
    const m = summonsEmail(s, ai, { forReferrer: false, patientHasEmail, due, link: who.pk ? caseLink(id, false) : undefined });
    const r = await sendMail(db, id, 'summons_patient', { to: who.patient, ...m, attachments });
    if (r.ok) sent++; else if (r.error) errors.push(r.error);
  }
  if (who.referrer.length) {
    const m = summonsEmail(s, ai, { forReferrer: true, patientHasEmail, link: caseLink(id, false), due });
    const r = await sendMail(db, id, 'summons_firm', { to: who.referrer, ...m, attachments });
    if (r.ok) sent++; else if (r.error) errors.push(r.error);
  }
  return { ok: sent > 0, sent, info: errors[0] || '' };
}

/** To a patient who booked by himself: how to pay the deposit that holds the slot. */
export async function sendDepositRequest(id: string, uploadLink: string): Promise<NotifyResult> {
  const db = createAdminClient();
  const { a, s } = await load(db, id);
  if (!a || !(Number(a.deposit_amount) > 0) || a.deposit_paid_at) return { ok: true, sent: 0, info: '' };
  if (await alreadySent(db, id, 'deposit_request')) return { ok: true, sent: 0, info: 'כבר נשלח' };
  const who = await audience(db, a);
  if (!who.patient.length) return { ok: false, sent: 0, info: 'אין מייל למטופל' };
  const r = await sendMail(db, id, 'deposit_request', { to: who.patient, ...depositEmail(s, info(a), Number(a.deposit_amount), s.deposit_hold_hours || 48, uploadLink) });
  return { ok: r.ok, sent: r.ok ? 1 : 0, info: r.error || '' };
}

export async function sendDeclined(id: string): Promise<NotifyResult> {
  const db = createAdminClient();
  const { a, s } = await load(db, id);
  if (!a) return { ok: false, sent: 0, info: 'התיק לא נמצא' };
  const m = declinedEmail(s, info(a), a.decline_reason, `${appUrl()}/firm/book`);
  const r = await sendMail(db, id, 'declined', { to: await firmEmails(db, a.firm_id, a.firm?.email, a.notify_emails), ...m });
  return { ok: r.ok, sent: r.ok ? 1 : 0, info: r.error || '' };
}

export async function sendDocRequest(id: string, items: string[], note: string): Promise<NotifyResult> {
  const db = createAdminClient();
  const { a, s } = await load(db, id);
  if (!a) return { ok: false, sent: 0, info: 'התיק לא נמצא' };
  const m = docRequestEmail(s, info(a), items, note, caseLink(id, false));
  const r = await sendMail(db, id, 'doc_request', { to: await firmEmails(db, a.firm_id, a.firm?.email, a.notify_emails), ...m });
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

/**
 * The frequent job: reminders three days and two hours before every appointment (patient, referrer, doctor),
 * and requests whose deposit didn't arrive in time are cancelled. Safe to run as often as wanted.
 */
export async function runTick(): Promise<NotifyResult> {
  const db = createAdminClient();
  const s = await settingsOf(db);
  let sent = 0;
  const now = Date.now();
  const iso = (ms: number) => new Date(now + ms).toISOString();
  const H = 3600_000;

  if (s.reminders_on) {
    const { data } = await db.from('appointments').select('*, firm:firms(name, email, kind)')
      .in('status', ['booked', 'draft']).eq('walk_in', false).gt('starts_at', iso(0)).lt('starts_at', iso(72 * H + 15 * 60_000));
    const staff = await staffEmails(db, s);
    for (const a of (data as Appt[] | null) ?? []) {
      const left = new Date(a.starts_at).getTime() - now;
      let at: RemindWhen | null = null;
      if (left <= 2 * H + 15 * 60_000 && !a.remind_2h_at) at = '2h';
      else if (left > 60 * H && left <= 72 * H + 15 * 60_000 && !a.remind_3d_at) at = '3d';
      if (!at) continue;
      // mark first, so a slow run never sends the same reminder twice
      const col = at === '2h' ? 'remind_2h_at' : 'remind_3d_at';
      const { data: claimed } = await db.from('appointments').update({ [col]: new Date().toISOString(), ...(at === '3d' ? {} : { reminder_sent_at: new Date().toISOString() }) })
        .eq('id', a.id).is(col, null).select('id');
      if (!claimed?.length) continue;
      const ai = info(a);
      const who = await audience(db, a);
      const due = await dueOf(db, a);
      if (who.patient.length) {
        const r = await sendMail(db, a.id, `reminder_${at}_patient`, { to: who.patient, ...reminderEmail(s, ai, false, at, { due, link: who.pk ? caseLink(a.id, false) : undefined }) });
        if (r.ok) sent++;
      }
      if (who.referrer.length) {
        const r = await sendMail(db, a.id, `reminder_${at}_firm`, { to: who.referrer, ...reminderEmail(s, ai, true, at, { link: caseLink(a.id, false) }) });
        if (r.ok) sent++;
      }
      if (s.sms_reminders !== false && smsEnabled() && a.patient_phone) {
        const r = await sendSms(db, a.id, `reminder_${at}`, a.patient_phone, smsReminderText(s, ai, at));
        if (r.ok) sent++;
      }
      if (staff.length) {
        const r = await sendMail(db, a.id, `reminder_${at}_doctor`, { to: staff, ...reminderEmail(s, ai, 'doctor', at, { link: caseLink(a.id, true) }) });
        if (r.ok) sent++;
      }
    }
  }

  // requests that waited too long for the deposit (and no transfer confirmation was sent)
  const hold = Math.max(1, s.deposit_hold_hours || 48);
  const { data: stale } = await db.from('appointments').select('*, firm:firms(name, email, kind)')
    .eq('status', 'pending').gt('deposit_amount', 0).is('deposit_paid_at', null).is('deposit_proof_at', null).lt('created_at', iso(-hold * H)).limit(50);
  for (const a of (stale as Appt[] | null) ?? []) {
    const { data: done } = await db.from('appointments').update({ status: 'cancelled', decline_reason: 'לא התקבלה מקדמה בזמן' }).eq('id', a.id).eq('status', 'pending').select('id');
    if (!done?.length) continue;
    const who = await audience(db, a);
    if (who.patient.length) await sendMail(db, a.id, 'deposit_expired', { to: who.patient, ...depositExpiredEmail(s, info(a), `${appUrl()}/book`) });
  }
  return { ok: true, sent, info: '' };
}

/** Kept for the daily scheduler. */
export const sendReminders = runTick;

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
  const firmTo = await firmEmails(db, a.firm_id, a.firm?.email, a.notify_emails);
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
  const pdf = await renderPdf(letterHtml(s, doc, pt, { title: ai.label, visitDate: ilParts(a.starts_at).date, signed: true }), [s.lh_name, s.lh_address].filter(Boolean).join(' · '));
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

/**
 * The final letter to addresses typed by hand (a lawyer's colleague, an insurer, the court's secretary).
 * Callers check permission; at most 10 such sends per case per day.
 */
export async function sendLetterTo(id: string, emails: string[], opts: { byReferrer: boolean }): Promise<NotifyResult> {
  const db = createAdminClient();
  const to = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))].slice(0, 5);
  if (!to.length) return { ok: false, sent: 0, info: 'כתובת המייל לא תקינה' };
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await db.from('email_log').select('id', { count: 'exact', head: true }).eq('appointment_id', id).eq('kind', 'letter_extra').gte('created_at', since);
  if ((count ?? 0) + to.length > 10) return { ok: false, sent: 0, info: 'נשלחו כבר הרבה מיילים מהתיק היום. נסו שוב מחר.' };
  const { a, s } = await load(db, id);
  if (!a) return { ok: false, sent: 0, info: 'התיק לא נמצא' };
  const { data: l } = await db.from('letters').select('*').eq('appointment_id', id).maybeSingle();
  if (!l?.is_final || !l.final_body) return { ok: false, sent: 0, info: 'המכתב עוד לא סופי' };
  if (opts.byReferrer && s.letter_requires_payment) {
    const { data: pays } = await db.from('payments').select('amount').eq('appointment_id', id);
    const paid = (pays ?? []).reduce((x, p) => x + Number(p.amount), 0);
    if (paid + 0.001 < Number(a.price)) return { ok: false, sent: 0, info: 'המכתב יהיה זמין לשליחה אחרי השלמת התשלום.' };
  }
  const ai = info(a);
  ai.type = (l.final_letter_type || l.letter_type) as ReferralType;
  const doc = { letter_type: ai.type, recipient: l.final_recipient || '', subject: l.final_subject || '', body: l.final_body, letter_date: l.letter_date || todayIL() };
  const pt = { name: a.patient_name, idNumber: a.patient_id_number, dob: a.patient_dob };
  const pdf = await renderPdf(letterHtml(s, doc, pt, { title: ai.label, visitDate: ilParts(a.starts_at).date, signed: true }), [s.lh_name, s.lh_address].filter(Boolean).join(' · '));
  if (!pdf) return { ok: false, sent: 0, info: 'יצירת קובץ ה־PDF נכשלה. נסו שוב בעוד דקה.' };
  const r = await sendMail(db, id, 'letter_extra', {
    to,
    ...letterEmail(s, ai, { forReferrer: true, attached: true }),
    attachments: [{ filename: letterFileName(doc, pt), content: pdf, contentType: 'application/pdf' }],
  });
  return r.ok ? { ok: true, sent: to.length, info: `המכתב נשלח ל־${to.join(', ')}` } : { ok: false, sent: 0, info: r.error || 'השליחה נכשלה' };
}

/** A prescription as a PDF to the patient (or another address the doctor types). Callers check permission. */
export async function sendRx(rxId: string, emails: string[]): Promise<NotifyResult> {
  const db = createAdminClient();
  const to = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))].slice(0, 3);
  if (!to.length) return { ok: false, sent: 0, info: 'כתובת המייל לא תקינה' };
  const { data: rx } = await db.from('prescriptions').select('*').eq('id', rxId).maybeSingle();
  if (!rx) return { ok: false, sent: 0, info: 'המרשם לא נמצא' };
  const { a, s } = await load(db, rx.appointment_id);
  if (!a) return { ok: false, sent: 0, info: 'התיק לא נמצא' };
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await db.from('email_log').select('id', { count: 'exact', head: true }).eq('appointment_id', a.id).eq('kind', 'rx').gte('created_at', since);
  if ((count ?? 0) + to.length > 10) return { ok: false, sent: 0, info: 'נשלחו כבר הרבה מיילים מהתיק היום.' };
  const pt = { name: a.patient_name, idNumber: a.patient_id_number, dob: a.patient_dob };
  const pdf = await renderPdf(rxHtml(s, { items: rx.items as RxItem[], notes: rx.notes, rx_date: rx.rx_date, rx_no: rx.rx_no }, pt), [s.lh_name, s.lh_address].filter(Boolean).join(' · '));
  if (!pdf) return { ok: false, sent: 0, info: 'יצירת קובץ ה־PDF נכשלה. אפשר להדפיס ולשלוח ידנית.' };
  const r = await sendMail(db, a.id, 'rx', {
    to,
    ...rxEmail(s, a.patient_name),
    attachments: [{ filename: `מרשם ${rx.rx_no ?? ''} - ${a.patient_name}.pdf`.replace(/[\\/:*?"<>|]+/g, ' '), content: pdf, contentType: 'application/pdf' }],
  });
  if (r.ok) await db.from('prescriptions').update({ sent_at: new Date().toISOString() }).eq('id', rxId);
  return r.ok ? { ok: true, sent: to.length, info: `המרשם נשלח ל־${to.join(', ')}` } : { ok: false, sent: 0, info: r.error || 'השליחה נכשלה' };
}
