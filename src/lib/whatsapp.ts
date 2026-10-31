import 'server-only';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Settings } from './constants';
import { toE164 } from './sms';
import { when } from './messages';
import { appUrl } from './mail';

/*
 * WhatsApp through Meta's Cloud API (no middleman). Turned on by server settings in Vercel → Environment Variables:
 *   WHATSAPP_TOKEN          a permanent System User token (whatsapp_business_messaging + whatsapp_business_management)
 *   WHATSAPP_PHONE_ID       the "Phone number ID" of the clinic's number
 *   WHATSAPP_WABA_ID        the "WhatsApp Business Account ID" (to send the message templates for approval)
 *   WHATSAPP_APP_SECRET     the app's secret (App settings → Basic), to check that incoming webhooks are from Meta
 *   WHATSAPP_VERIFY_TOKEN   any long random text, typed also in the webhook settings in Meta
 * Messages that start a conversation must be pre-approved templates (below). Replies inside 24 hours of the
 * patient's last message can be free text.
 */

const GRAPH = 'https://graph.facebook.com/v21.0';
export const waEnabled = () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
export const waOn = (s: Settings) => waEnabled() && s.whatsapp_on !== false;

/** 9725XXXXXXXX (WhatsApp's format: digits, no plus), or null for anything that is not an Israeli mobile. */
export function waPhone(raw: string | null | undefined): string | null {
  const e = toE164(String(raw || ''));
  return e ? e.slice(1) : null;
}

/** The pre-approved templates. Body variables are {{1}}, {{2}}…; Meta does not allow a body to start or end with one. */
export const TEMPLATES = {
  clinic_appointment_confirmed: {
    title: 'זימון לתור',
    body: 'שלום {{1}}, התור שלך אצל {{2}} נקבע ל{{3}}.\nכתובת: {{4}}\nלשאלות או לשינוי אפשר להשיב להודעה זו.',
    example: ['ישראל ישראלי', 'ד״ר אלרן חנוך', 'יום שלישי, 3.11.2026 בשעה 10:00', 'רחוב הרצל 1, תל אביב'],
  },
  clinic_appointment_reminder: {
    title: 'תזכורת לתור',
    body: 'תזכורת: שלום {{1}}, יש לך תור אצל {{2}} {{3}}.\nכתובת: {{4}}\nלשאלות אפשר להשיב להודעה זו.',
    example: ['ישראל ישראלי', 'ד״ר אלרן חנוך', 'מחר, יום שלישי 3.11.2026 בשעה 10:00', 'רחוב הרצל 1, תל אביב'],
  },
  clinic_appointment_moved: {
    title: 'עדכון מועד',
    body: 'שלום {{1}}, מועד התור שלך אצל {{2}} עודכן.\nהמועד החדש: {{3}}\nבמקום: {{4}}\nלשאלות אפשר להשיב להודעה זו.',
    example: ['ישראל ישראלי', 'ד״ר אלרן חנוך', 'יום רביעי, 4.11.2026 בשעה 12:00', 'יום שלישי, 3.11.2026 בשעה 10:00'],
  },
  clinic_appointment_cancelled: {
    title: 'ביטול תור',
    body: 'שלום {{1}}, התור שלך אצל {{2}} ב{{3}} בוטל.\nלקביעת מועד חדש: {{4}}\nתודה.',
    example: ['ישראל ישראלי', 'ד״ר אלרן חנוך', 'יום שלישי, 3.11.2026 בשעה 10:00', 'https://doctorline.co.il/book'],
  },
  clinic_document_ready: {
    title: 'מסמך מוכן',
    body: 'שלום {{1}}, המסמך מ{{2}} מוכן.\nלצפייה והורדה מאובטחת: {{3}}\nלפתיחה יש להזין את 4 הספרות האחרונות של תעודת הזהות.',
    example: ['ישראל ישראלי', 'ד״ר אלרן חנוך', 'https://doctorline.co.il/d/abc'],
  },
} as const;
export type TemplateName = keyof typeof TEMPLATES;

const fill = (body: string, params: string[]) => body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? '');
// WhatsApp rejects newlines, tabs and 4+ spaces inside a variable
const clean = (v: string) => String(v || '—').replace(/[\n\t]+/g, ' ').replace(/ {4,}/g, '   ').slice(0, 500);

async function graph(path: string, body?: unknown, method = body ? 'POST' : 'GET') {
  const res = await fetch(`${GRAPH}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(j?.error?.error_user_msg || j?.error?.message || `HTTP ${res.status}`));
  return j;
}

type Sent = { ok: boolean; error?: string };

async function deliver(db: SupabaseClient, o: { appointmentId: string | null; phone: string; kind: string; text: string; payload: Record<string, unknown> }): Promise<Sent> {
  const row = { appointment_id: o.appointmentId, phone: o.phone, direction: 'out', kind: o.kind, body: o.text };
  try {
    const j = await graph(`${process.env.WHATSAPP_PHONE_ID}/messages`, { messaging_product: 'whatsapp', recipient_type: 'individual', to: o.phone, ...o.payload });
    await db.from('wa_messages').insert({ ...row, wa_id: j?.messages?.[0]?.id ?? null, status: 'sent' });
    return { ok: true };
  } catch (e) {
    const error = (e as Error).message || 'השליחה נכשלה';
    await db.from('wa_messages').insert({ ...row, status: 'failed', error: error.slice(0, 900) });
    return { ok: false, error };
  }
}

/** A template message (starts a conversation). Skipped quietly when WhatsApp is off or the number is not a mobile. */
export async function sendTemplate(db: SupabaseClient, s: Settings, appointmentId: string | null, rawPhone: string | null | undefined, name: TemplateName, params: string[]): Promise<Sent> {
  if (!waOn(s)) return { ok: false, error: 'וואטסאפ לא מחובר' };
  const phone = waPhone(rawPhone);
  if (!phone) return { ok: false, error: 'אין מספר נייד תקין' };
  const p = params.map(clean);
  return deliver(db, {
    appointmentId, phone, kind: name, text: fill(TEMPLATES[name].body, p),
    payload: { type: 'template', template: { name, language: { code: 'he' }, components: [{ type: 'body', parameters: p.map((text) => ({ type: 'text', text })) }] } },
  });
}

/** A free-text reply; WhatsApp accepts it only within 24 hours of the patient's last message. */
export async function sendText(db: SupabaseClient, appointmentId: string | null, phone: string, text: string): Promise<Sent> {
  if (!waEnabled()) return { ok: false, error: 'וואטסאפ לא מחובר' };
  return deliver(db, { appointmentId, phone, kind: 'text', text, payload: { type: 'text', text: { preview_url: true, body: text.slice(0, 4000) } } });
}

/** The latest case of a phone number (by earlier messages), so replies show up with the right patient. */
export async function caseOfPhone(db: SupabaseClient, phone: string): Promise<string | null> {
  const { data } = await db.from('wa_messages').select('appointment_id').eq('phone', phone).not('appointment_id', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return (data?.appointment_id as string | undefined) ?? null;
}

/** Sends every template to Meta for approval (ones that already exist are reported as such). */
export async function submitTemplates(): Promise<{ name: string; ok: boolean; info: string }[]> {
  const waba = process.env.WHATSAPP_WABA_ID;
  if (!waEnabled() || !waba) return [{ name: '', ok: false, info: 'חסרים WHATSAPP_TOKEN / WHATSAPP_PHONE_ID / WHATSAPP_WABA_ID ב־Vercel' }];
  const out: { name: string; ok: boolean; info: string }[] = [];
  for (const [name, t] of Object.entries(TEMPLATES)) {
    try {
      const j = await graph(`${waba}/message_templates`, {
        name, language: 'he', category: 'UTILITY',
        components: [{ type: 'BODY', text: t.body, example: { body_text: [t.example] } }],
      });
      out.push({ name, ok: true, info: String(j?.status || 'נשלח לאישור') });
    } catch (e) {
      const m = (e as Error).message;
      out.push({ name, ok: /already exists|קיים/i.test(m), info: /already exists/i.test(m) ? 'כבר קיים' : m });
    }
  }
  return out;
}

/** The approval status of our templates at Meta. */
export async function templateStatus(): Promise<Record<string, string>> {
  const waba = process.env.WHATSAPP_WABA_ID;
  if (!waEnabled() || !waba) return {};
  try {
    const j = await graph(`${waba}/message_templates?fields=name,status,language&limit=100`);
    const map: Record<string, string> = {};
    for (const t of (j?.data ?? []) as { name: string; status: string }[]) if (t.name in TEMPLATES) map[t.name] = t.status;
    return map;
  } catch {
    return {};
  }
}

/** Checks Meta's signature on a webhook body (X-Hub-Signature-256). */
export function validSignature(raw: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith('sha256=')) return false;
  const want = Buffer.from(createHmac('sha256', secret).update(raw, 'utf8').digest('hex'));
  const got = Buffer.from(header.slice(7));
  return want.length === got.length && timingSafeEqual(want, got);
}

/** A personal link (60 days) to the final document; opened with the last 4 digits of the patient's ID number. */
export async function docLinkFor(db: SupabaseClient, id: string): Promise<string | null> {
  const key = randomBytes(24).toString('hex');
  const { error } = await db.from('appointments').update({
    doc_key_hash: createHash('sha256').update(key).digest('hex'),
    doc_key_expires: new Date(Date.now() + 60 * 86400_000).toISOString(),
    doc_key_fails: 0,
  }).eq('id', id);
  return error ? null : `${appUrl()}/d/${id}?k=${key}`;
}

export const waWhen = (iso: string) => when(iso).label;
