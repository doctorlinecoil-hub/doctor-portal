import { createClient } from '@/lib/supabase/server';
import { PAY_METHODS, STATUS_STAFF, type ApptStatus, type PayMethod, type ReferralType } from '@/lib/constants';
import { labelOf } from '@/lib/services';
import { fmtDate, ilParts } from '@/lib/dates';
import { toCsv } from '@/lib/reports';
import { fetchAll } from '@/lib/fetchAll';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Excel export (CSV) for the clinic (doctor and admin): all cases, or all payments. */
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: admin } = await supabase.rpc('is_staff');
  if (!admin) return new Response('אין הרשאה', { status: 403 });
  const what = new URL(req.url).searchParams.get('what') === 'payments' ? 'payments' : 'cases';
  let csv: string;
  if (what === 'cases') {
    type R = { case_no: number; starts_at: string; status: ApptStatus; referral_type: ReferralType; patient_name: string; patient_id_number: string; patient_phone: string; patient_email: string; price: number; payer: string; id: string; firms: { name: string } | null };
    const [data, pays] = await Promise.all([
      fetchAll<R>((x, y) => supabase.from('appointments').select('case_no, starts_at, status, referral_type, patient_name, patient_id_number, patient_phone, patient_email, price, payer, id, firms(name)').order('starts_at', { ascending: false }).range(x, y)),
      fetchAll<{ appointment_id: string; amount: number }>((x, y) => supabase.from('payments').select('appointment_id, amount').order('created_at').range(x, y)),
    ]);
    const paid = new Map<string, number>();
    for (const p of pays) paid.set(p.appointment_id, (paid.get(p.appointment_id) ?? 0) + Number(p.amount));
    csv = toCsv([
      ['תיק', 'תאריך', 'שעה', 'סטטוס', 'סוג', 'מפנה', 'מטופל', 'ת״ז', 'טלפון', 'מייל', 'משלם', 'מחיר', 'שולם', 'יתרה'],
      ...data.map((r) => {
        const p = ilParts(r.starts_at);
        const pd = paid.get(r.id) ?? 0;
        return [r.case_no, fmtDate(p.date), p.time, STATUS_STAFF[r.status], labelOf(r), r.firms?.name ?? '', r.patient_name, r.patient_id_number, r.patient_phone, r.patient_email,
          r.payer === 'patient' ? 'המטופל' : 'המפנה', Number(r.price), pd, Math.max(0, Number(r.price) - pd)];
      }),
    ]);
  } else {
    type P = { paid_on: string; amount: number; method: PayMethod; receipt_no: string; note: string; appointments: { case_no: number; patient_name: string; firms: { name: string } | null } | null };
    const data = await fetchAll<P>((x, y) => supabase.from('payments').select('paid_on, amount, method, receipt_no, note, appointments(case_no, patient_name, firms(name))').order('paid_on', { ascending: false }).range(x, y));
    csv = toCsv([
      ['תאריך', 'סכום', 'אמצעי', 'קבלה', 'תיק', 'מטופל', 'מפנה', 'הערה'],
      ...data.map((p) => [fmtDate(p.paid_on), Number(p.amount), PAY_METHODS[p.method], p.receipt_no, p.appointments?.case_no ?? '', p.appointments?.patient_name ?? '', p.appointments?.firms?.name ?? '', p.note]),
    ]);
  }
  await supabase.rpc('log_event', { p_action: 'export', p_entity: what, p_entity_id: null });
  const name = `${what === 'cases' ? 'תיקים' : 'תשלומים'}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`, 'Cache-Control': 'no-store' },
  });
}
