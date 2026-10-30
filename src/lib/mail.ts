import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
 * Email through Resend (resend.com, free up to 3,000 emails a month).
 * Needs RESEND_API_KEY and MAIL_FROM, e.g. "מרפאת ד״ר אלרן חנוך <clinic@doctorline.co.il>"
 * (the domain must be verified in Resend). Without them, emails are skipped and the WhatsApp buttons still work.
 */

export type Attachment = { filename: string; content: Buffer | string; contentType?: string };
export type Mail = { to: string[]; subject: string; html: string; text: string; replyTo?: string; attachments?: Attachment[] };

export function mailEnabled() {
  return !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

/** Public address of the portal, for links in emails. */
export function appUrl() {
  const u = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '') || 'http://localhost:3000';
  return u.replace(/\/+$/, '');
}

const clean = (list: string[]) => [...new Set(list.map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];

/** Sends one email (to all recipients together) and records it per recipient. Never throws. */
export async function sendMail(db: SupabaseClient, appointmentId: string | null, kind: string, m: Mail): Promise<{ ok: boolean; error?: string }> {
  const to = clean(m.to);
  if (!to.length) return { ok: false, error: 'אין כתובת מייל' };
  const log = (status: 'sent' | 'failed' | 'skipped', provider_id = '', error = '') =>
    db.from('email_log').insert(to.map((addr) => ({ appointment_id: appointmentId, kind, to_addr: addr, status, provider_id, error: error.slice(0, 900) })));

  if (!mailEnabled()) {
    await log('skipped', '', 'שליחת מיילים לא הוגדרה');
    return { ok: false, error: 'שליחת מיילים עוד לא הוגדרה (RESEND_API_KEY, MAIL_FROM)' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        // each recipient sees only his own address (patients, offices and extra addresses don't learn each other's)
        to: [to[0]],
        bcc: to.length > 1 ? to.slice(1) : undefined,
        subject: m.subject,
        html: m.html,
        text: m.text,
        reply_to: m.replyTo || process.env.MAIL_REPLY_TO || undefined,
        // a unique id per email: Gmail and Outlook don't fold different cases into one conversation
        headers: { 'X-Entity-Ref-ID': crypto.randomUUID() },
        attachments: m.attachments?.map((a) => ({
          filename: a.filename,
          content: typeof a.content === 'string' ? Buffer.from(a.content, 'utf8').toString('base64') : a.content.toString('base64'),
          content_type: a.contentType,
        })),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = String(j?.message || j?.error || `HTTP ${res.status}`);
      await log('failed', '', err);
      return { ok: false, error: err };
    }
    await log('sent', String(j?.id || ''));
    return { ok: true };
  } catch (e) {
    const err = (e as Error).message || 'network error';
    await log('failed', '', err);
    return { ok: false, error: err };
  }
}

/** True when this kind of email already went out for the appointment (to avoid double sending). */
export async function alreadySent(db: SupabaseClient, appointmentId: string, kind: string) {
  const { count } = await db.from('email_log').select('id', { count: 'exact', head: true }).eq('appointment_id', appointmentId).eq('kind', kind).eq('status', 'sent');
  return (count ?? 0) > 0;
}
