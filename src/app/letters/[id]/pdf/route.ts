import { requireUser } from '@/lib/auth';
import type { ReferralType } from '@/lib/constants';
import { ilParts, todayIL } from '@/lib/dates';
import { letterFileName, letterHtml, renderPdf } from '@/lib/pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type L = { letter_type: ReferralType; recipient: string; subject: string; body: string; letter_date: string | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The final letter as a PDF file, downloaded straight away.
 * Who may get it is decided by the database (final_letter): staff, or the referring office of the case once released.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response('לא נמצא', { status: 404 });
  const { supabase, settings } = await requireUser();
  const [{ data: a }, { data: rows }] = await Promise.all([
    supabase.from('appointments').select('id, patient_name, patient_id_number, patient_dob, starts_at, service_label').eq('id', id).maybeSingle(),
    supabase.rpc('final_letter', { p_id: id }),
  ]);
  const letter = Array.isArray(rows) && rows.length ? (rows[0] as L) : null;
  if (!a || !letter) {
    return new Response('המסמך עוד לא זמין להורדה (הוא ייפתח אחרי אישור התשלום במרפאה).', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  const doc = { ...letter, letter_date: letter.letter_date || todayIL() };
  const pt = { name: a.patient_name ?? '', idNumber: a.patient_id_number ?? '', dob: a.patient_dob };
  const pdf = await renderPdf(
    letterHtml(settings, doc, pt, { title: a.service_label || undefined, visitDate: ilParts(a.starts_at).date, signed: settings.sign_final }),
    [settings.lh_name, settings.lh_address].filter(Boolean).join(' · '),
  );
  if (!pdf) return Response.redirect(new URL(`/letters/${id}/print`, _req.url), 302);
  await supabase.rpc('log_event', { p_action: 'print_final', p_entity: 'letter', p_entity_id: id });
  const name = letterFileName(doc, pt);
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="letter-${id.slice(0, 8)}.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
