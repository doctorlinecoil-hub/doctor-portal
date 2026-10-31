import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ACCEPTED_TYPES, BUCKET, MAX_FILE_BYTES } from '@/lib/constants';
import { caseFromAddress, verifyWebhook } from '@/lib/inbound';
import { notifyPaymentProof, notifyPaymentReply } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
type Received = { email_id: string; from: string; to: string[]; cc?: string[]; received_for?: string[]; subject: string; attachments?: { id: string; filename: string; content_type: string }[] };

// reading received mail needs a Resend key with full access (a sending-only key gets 401): RESEND_RECEIVE_KEY, or the main key
const readKey = () => process.env.RESEND_RECEIVE_KEY || process.env.RESEND_API_KEY;
const api = (path: string) => fetch(`https://api.resend.com${path}`, { headers: { Authorization: `Bearer ${readKey()}` }, signal: AbortSignal.timeout(20_000) });

/**
 * Resend "email.received": a payer answered a payment email. The transfer confirmation attached to the reply
 * is saved in the case (only for a reply address with the right token), and the doctor gets it by email.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  // with a signing secret the signature must match; without one, nothing in the payload is trusted:
  // the email is read back from Resend with our own key, so only mail our account really received is used
  if (process.env.RESEND_WEBHOOK_SECRET && !verifyWebhook(raw, { id: req.headers.get('svix-id'), timestamp: req.headers.get('svix-timestamp'), signature: req.headers.get('svix-signature') })) {
    return new Response('bad signature', { status: 401 });
  }
  if (!readKey()) return new Response('receiving is off', { status: 503 });
  let event: { type?: string; data?: Received };
  try { event = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }
  if (event.type !== 'email.received' || !event.data?.email_id) return Response.json({ ok: true, skipped: true });
  if (!/^[\w-]{6,80}$/.test(event.data.email_id)) return Response.json({ ok: true, skipped: 'bad id' });
  // the real email, from Resend (not from the webhook body)
  const full = await api(`/emails/receiving/${encodeURIComponent(event.data.email_id)}`).catch(() => null);
  const body = full?.ok ? await full.json().catch(() => null) as (Received & { text?: string }) | null : null;
  if (!body) {
    // the key can't read received mail: still tell the doctor a reply came in (only for a real case address with its token)
    const pd = event.data;
    const n = [...(pd.to ?? []), ...(pd.received_for ?? [])].map(caseFromAddress).find((x) => x != null) ?? null;
    if (n != null && (full?.status === 401 || full?.status === 403)) {
      const db0 = createAdminClient();
      const { data: a0 } = await db0.from('appointments').select('id').eq('case_no', n).maybeSingle();
      if (a0) after(async () => {
        await notifyPaymentReply(a0.id, { from: String(pd.from || ''), subject: String(pd.subject || ''), text: `(התקבלה תשובה${pd.attachments?.length ? ` עם ${pd.attachments.length} קבצים מצורפים` : ''}, אבל המערכת לא יכולה לקרוא אותה: מפתח ה־Resend הוא "Sending access" בלבד. יש ליצור מפתח עם Full access ולשמור אותו ב־Vercel בשם RESEND_RECEIVE_KEY, ואז ללחוץ Replay על האירוע ב־Resend.)` }).catch(() => undefined);
      });
    }
    return Response.json({ ok: true, skipped: 'not found', status: full?.status ?? 0 });
  }
  const d: Received = { ...body, email_id: event.data.email_id };
  const caseNo = [...(d.to ?? []), ...(d.cc ?? []), ...(d.received_for ?? [])].map(caseFromAddress).find((n) => n != null) ?? null;
  if (caseNo == null) return Response.json({ ok: true, skipped: 'no case address' });

  const db = createAdminClient();
  const { data: a } = await db.from('appointments').select('id, firm_id, status').eq('case_no', caseNo).maybeSingle();
  if (!a || a.status === 'cancelled') return Response.json({ ok: true, skipped: 'no case' });

  // the attachments (download links are valid for an hour)
  const saved: string[] = [];
  if (d.attachments?.length) {
    const res = await api(`/emails/receiving/${encodeURIComponent(d.email_id)}/attachments`).catch(() => null);
    const j = res?.ok ? await res.json().catch(() => null) : null;
    const list = ((j?.data ?? []) as { filename?: string; content_type?: string; size?: number; download_url?: string }[]).slice(0, 5);
    for (const f of list) {
      const type = String(f.content_type || '').toLowerCase();
      if (!f.download_url || !ACCEPTED_TYPES.includes(type) || (f.size && f.size > MAX_FILE_BYTES)) continue;
      const file = await fetch(f.download_url, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
      if (!file?.ok) continue;
      const buf = Buffer.from(await file.arrayBuffer());
      if (!buf.length || buf.length > MAX_FILE_BYTES) continue;
      const path = `${a.firm_id}/${a.id}/payment-${crypto.randomUUID()}.${EXT[type] || 'bin'}`;
      const up = await db.storage.from(BUCKET).upload(path, buf, { contentType: type, upsert: false });
      if (up.error) continue;
      await db.from('documents').insert({ appointment_id: a.id, firm_id: a.firm_id, storage_path: path, file_name: `אישור העברה (מייל) - ${String(f.filename || 'קובץ').slice(0, 180)}`, mime_type: type, size_bytes: buf.length });
      saved.push(path);
    }
  }

  // the reply text, for the doctor
  const text = String(body?.text || '').split(/\n\s*(?:On .+wrote:|ב.+כתב:|-----Original Message-----)/)[0].trim().slice(0, 3000);

  if (saved.length) await db.rpc('payment_proof_sent', { p_id: a.id });
  after(async () => {
    if (saved.length) await notifyPaymentProof(a.id, saved[0], { from: d.from, text }).catch(() => undefined);
    else await notifyPaymentReply(a.id, { from: d.from, subject: d.subject, text }).catch(() => undefined);
  });
  return Response.json({ ok: true, saved: saved.length });
}
