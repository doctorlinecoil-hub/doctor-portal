import { requireUser } from '@/lib/auth';
import LiveRefresh from '@/components/LiveRefresh';
import { loadAppointments } from '@/lib/queries';
import { PendingPayView, type PayLine } from '@/views/PendingPayView';
import { released } from '@/lib/types';
import { todayIL } from '@/lib/dates';
import ApprovePay from './ApprovePay';
import RemindPay from './RemindPay';
import { BUCKET, ils, payLines } from '@/lib/constants';
import { labelOf } from '@/lib/services';
import { fmtDate, ilParts } from '@/lib/dates';
import type { ProofCheck } from '@/lib/payCheck';

export const dynamic = 'force-dynamic';

/** Payment approval: ready documents wait here until the doctor confirms what was paid. */
export default async function PaymentApprovalPage() {
  const { supabase, settings } = await requireUser(['doctor', 'admin']);
  const gate = settings.letter_requires_payment !== false;
  const today = todayIL();
  const rows = await loadAppointments(supabase, { order: 'desc', limit: 3000 });
  const waiting = rows.filter((r) => r.status === 'done' && !released(r, gate));
  const approved = rows.filter((r) => r.status === 'done' && !!r.payment_ok_at).sort((a, b) => (b.payment_ok_at || '').localeCompare(a.payment_ok_at || '')).slice(0, 8);
  const ids = [...waiting, ...approved].map((r) => r.id);
  const { data: p } = ids.length ? await supabase.from('payments').select('appointment_id, amount, method, paid_on').in('appointment_id', ids).order('paid_on') : { data: [] };
  const wids = waiting.map((r) => r.id);
  const [{ data: contacts }, { data: sent }] = wids.length ? await Promise.all([
    supabase.from('appointments').select('id, patient_phone, pay_proof_check, firm:firms(phone)').in('id', wids),
    supabase.from('email_log').select('appointment_id, created_at').eq('kind', 'payment_reminder').eq('status', 'sent').in('appointment_id', wids).order('created_at', { ascending: false }),
  ]) : [{ data: [] }, { data: [] }];
  const phoneOf = new Map(((contacts as { id: string; patient_phone: string | null; firm: { phone: string | null } | { phone: string | null }[] | null }[] | null) ?? [])
    .map((c) => [c.id, { patient: c.patient_phone, firm: (Array.isArray(c.firm) ? c.firm[0] : c.firm)?.phone ?? null }]));
  // transfer confirmations the payer uploaded (newest per case), with a link to open the file
  const { data: proofDocs } = wids.length
    ? await supabase.from('documents').select('appointment_id, storage_path, created_at').in('appointment_id', wids).like('file_name', 'אישור העברה%').order('created_at', { ascending: false })
    : { data: [] };
  const newest = new Map<string, { path: string; at: string }>();
  for (const d of (proofDocs as { appointment_id: string; storage_path: string; created_at: string }[] | null) ?? []) if (!newest.has(d.appointment_id)) newest.set(d.appointment_id, { path: d.storage_path, at: d.created_at });
  const paths = [...newest.values()].map((x) => x.path);
  const { data: signed } = paths.length ? await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600) : { data: [] };
  const urlOf = new Map(((signed as { path: string | null; signedUrl: string }[] | null) ?? []).map((x) => [x.path, x.signedUrl]));
  const checkOf = new Map(((contacts as { id: string; pay_proof_check: ProofCheck | null }[] | null) ?? []).map((c) => [c.id, c.pay_proof_check]));
  const proofs: Record<string, { url: string; at: string; check?: ProofCheck | null }> = {};
  for (const [id, x] of newest) { const u = urlOf.get(x.path); if (u) proofs[id] = { url: u, at: `${fmtDate(ilParts(x.at).date)} ${ilParts(x.at).time}`, check: checkOf.get(id) ?? null }; }
  const lastSent = new Map<string, string>();
  for (const x of (sent as { appointment_id: string; created_at: string }[] | null) ?? []) if (!lastSent.has(x.appointment_id)) lastSent.set(x.appointment_id, x.created_at);
  const { data: mp } = await supabase.from('payments').select('amount').gte('paid_on', `${today.slice(0, 7)}-01`);
  const month = ((mp as { amount: number }[] | null) ?? []).reduce((x, y) => x + Number(y.amount), 0);
  const pl = payLines(settings);
  const payInfo = [pl.bank.length ? `\nפרטי העברה:\n${pl.bank.join('\n')}` : '', pl.bit ? `ביט / פייבוקס: ${pl.bit}` : '', pl.note].filter(Boolean).join('\n');
  const pays: Record<string, PayLine[]> = {};
  for (const x of (p as (PayLine & { appointment_id: string })[] | null) ?? []) (pays[x.appointment_id] ??= []).push({ amount: Number(x.amount), method: x.method, paid_on: x.paid_on });
  return (
    <>
    <LiveRefresh />
    <PendingPayView month={month} waiting={waiting} approved={approved} gate={gate} pays={pays} proofs={proofs}
      remind={(r) => {
        const patientPays = r.firm_kind === 'private' || r.payer === 'patient';
        const ph = phoneOf.get(r.id);
        const due = Math.max(0, r.price - r.paid);
        const text = `שלום${patientPays && r.patient_name ? ` ${r.patient_name}` : ''},\n${labelOf(r)} עבור ${r.patient_name} (תיק ${r.case_no}) מוכנה וממתינה לתשלום${due > 0 ? ` (${ils(due)})` : ''}.\n${payInfo}\nמיד כשהתשלום יתקבל, המסמך יישלח אליכם במייל.\n${settings.lh_name}`;
        const last = lastSent.get(r.id);
        return <RemindPay id={r.id} who={patientPays ? 'מטופל' : 'מפנה'} phone={(patientPays ? ph?.patient : ph?.firm || ph?.patient) || null} text={text}
          last={last ? `${fmtDate(ilParts(last).date)} ${ilParts(last).time}` : null} />;
      }}
      action={(r, undo) => <ApprovePay id={r.id} today={today} undo={undo} due={Math.max(0, r.price - r.paid)} paidInFull={r.price > 0 && r.paid + 0.001 >= r.price} />} />
    </>
  );
}
