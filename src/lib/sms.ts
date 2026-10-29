import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Settings } from './constants';
import { wazeLink, when, type ApptInfo } from './messages';

/*
 * Text messages (SMS, or WhatsApp) through Twilio.
 * Turned on by three server settings (Vercel → Environment Variables):
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and the sender:
 *   TWILIO_FROM            an SMS sender: a number (+972…) or a name of up to 11 English letters (e.g. DrHanoch)
 *   TWILIO_WHATSAPP_FROM   optional: a WhatsApp Business sender (whatsapp:+972…); then messages go by WhatsApp
 * Every message is written to email_log (kind sms_…), so the case history shows it.
 */

export const smsEnabled = () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_FROM || process.env.TWILIO_WHATSAPP_FROM));
export const smsChannel = () => (process.env.TWILIO_WHATSAPP_FROM ? 'whatsapp' : 'sms');

/** Israeli mobile numbers to E.164 (+9725…); anything that is not a mobile number is skipped. */
export function toE164(raw: string): string | null {
  let d = String(raw || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('972')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  if (!/^5\d{8}$/.test(d)) return null;
  return `+972${d}`;
}

export async function sendSms(db: SupabaseClient, appointmentId: string | null, kind: string, phone: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const to = toE164(phone);
  if (!to) return { ok: false, error: 'מספר נייד לא תקין' };
  const log = (status: 'sent' | 'failed' | 'skipped', provider_id = '', error = '') =>
    db.from('email_log').insert({ appointment_id: appointmentId, kind: `sms_${kind}`, to_addr: to, status, provider_id, error: error.slice(0, 900) });
  if (!smsEnabled()) { await log('skipped', '', 'הודעות SMS לא הוגדרו'); return { ok: false, error: 'הודעות SMS לא הוגדרו' }; }
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const wa = process.env.TWILIO_WHATSAPP_FROM;
  const form = new URLSearchParams({
    To: wa ? `whatsapp:${to}` : to,
    From: wa ? (wa.startsWith('whatsapp:') ? wa : `whatsapp:${wa}`) : process.env.TWILIO_FROM!,
    Body: body.slice(0, 1200),
  });
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { const e = String(j?.message || `HTTP ${res.status}`); await log('failed', '', e); return { ok: false, error: e }; }
    await log('sent', String(j?.sid || ''));
    return { ok: true };
  } catch (e) {
    const err = (e as Error).message || 'network error';
    await log('failed', '', err);
    return { ok: false, error: err };
  }
}

/** The short reminder text (3 days or 2 hours before). */
export function smsReminderText(s: Settings, a: ApptInfo, at: '3d' | '2h' | 'tomorrow') {
  const w = when(a.startsAt);
  const lead = at === '2h' ? 'בעוד כשעתיים' : at === '3d' ? 'בעוד 3 ימים' : 'מחר';
  if (a.phone) {
    return [`שלום${a.patientName ? ` ${a.patientName}` : ''}, תזכורת: ${lead} (${w.label}) שיחה טלפונית עם ${s.lh_name}.`, 'הרופא יתקשר אליך למספר זה.', s.lh_phone ? `לשינוי: ${s.lh_phone}` : ''].filter(Boolean).join('\n');
  }
  return [
    `שלום${a.patientName ? ` ${a.patientName}` : ''}, תזכורת: ${lead} (${w.label}) תור אצל ${s.lh_name}.`,
    s.lh_address ? `כתובת: ${s.lh_address}${at === '2h' ? `\nניווט: ${wazeLink(s.lh_address)}` : ''}` : '',
    s.lh_phone ? `לשינוי או ביטול: ${s.lh_phone}` : '',
  ].filter(Boolean).join('\n');
}
