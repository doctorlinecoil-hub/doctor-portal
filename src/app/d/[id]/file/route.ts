import { createHash, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { SETTINGS_DEFAULTS, type ReferralType, type Settings } from '@/lib/constants';
import { ilParts, todayIL } from '@/lib/dates';
import { priorVisits } from '@/lib/visits';
import { letterFileName, letterHtml, renderPdf } from '@/lib/pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const back = (req: Request, id: string, k: string, e = '1') => Response.redirect(new URL(`/d/${id}?k=${k}${e ? `&e=${e}` : ''}`, req.url), 303);

/** The patient's personal document link: key + last 4 digits of the ID number → the final letter as a PDF. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await req.formData().catch(() => null);
  const k = String(form?.get('k') || '');
  const last4 = String(form?.get('last4') || '').replace(/\D/g, '');
  if (!UUID.test(id) || !/^[0-9a-f]{48}$/.test(k)) return new Response('לא נמצא', { status: 404 });
  const db = createAdminClient();
  const { data: a } = await db.from('appointments')
    .select('id, firm_id, status, patient_name, patient_id_number, patient_dob, starts_at, service_label, referral_type, doc_key_hash, doc_key_expires, doc_key_fails')
    .eq('id', id).maybeSingle();
  const want = Buffer.from(String(a?.doc_key_hash || ''));
  const got = Buffer.from(createHash('sha256').update(k).digest('hex'));
  const keyOk = !!a && want.length === got.length && timingSafeEqual(want, got) && !!a.doc_key_expires && new Date(a.doc_key_expires).getTime() > Date.now() && (a.doc_key_fails ?? 0) < 5;
  if (!a || !keyOk || a.status === 'cancelled') return back(req, id, k, '');
  const idDigits = String(a.patient_id_number || '').replace(/\D/g, '');
  if (last4.length !== 4 || idDigits.length < 4 || idDigits.slice(-4) !== last4) {
    await db.from('appointments').update({ doc_key_fails: (a.doc_key_fails ?? 0) + 1 }).eq('id', id);
    return back(req, id, k);
  }
  const [{ data: released }, { data: l }, { data: s0 }] = await Promise.all([
    db.rpc('letter_released', { p_id: id }),
    db.from('letters').select('*').eq('appointment_id', id).maybeSingle(),
    db.from('settings').select('*').eq('id', 1).single(),
  ]);
  if (!released || !l?.is_final || !l.final_body) return new Response('המסמך עוד לא זמין. לפרטים אפשר לפנות למרפאה.', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const s = { ...SETTINGS_DEFAULTS, ...(s0 as Settings) } as Settings;
  const type = (l.final_letter_type || l.letter_type) as ReferralType;
  const doc = { letter_type: type, recipient: l.final_recipient || '', subject: l.final_doc_title || '', body: l.final_body, letter_date: l.letter_date || todayIL() };
  const pt = { name: a.patient_name ?? '', idNumber: a.patient_id_number ?? '', dob: a.patient_dob };
  const pdf = await renderPdf(
    letterHtml(s, doc, pt, { title: (a.referral_type === type && a.service_label) || undefined, visitDate: ilParts(a.starts_at).date, signed: true, visits: l.show_visits ? await priorVisits(db, a) : [] }),
    [s.lh_name, s.lh_address].filter(Boolean).join(' · '),
  );
  if (!pdf) return new Response('לא הצלחנו להפיק את הקובץ כרגע. נסו שוב בעוד דקה.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  await db.from('appointments').update({ doc_key_fails: 0 }).eq('id', id);
  await db.from('email_log').insert({ appointment_id: id, kind: 'doc_link_opened', to_addr: 'whatsapp', status: 'sent', provider_id: '', error: '' });
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(letterFileName(doc, pt))}`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
