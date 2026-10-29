import { requireUser } from '@/lib/auth';
import { ReportsView } from '@/views/ReportsView';
import { buildReport, type RepAppt, type RepLetter, type RepPay } from '@/lib/reports';
import { fetchAll } from '@/lib/fetchAll';
import { ilToUtc, todayIL } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const { supabase } = await requireUser(['doctor', 'admin']);
  const today = todayIL();
  const from = ilToUtc(`${+today.slice(0, 4) - 1}-${today.slice(5, 7)}-01`, '00:00').toISOString();
  const [a, p, l] = await Promise.all([
    fetchAll<RepAppt & { firms: { name: string } | null }>((x, y) => supabase.from('appointments')
      .select('id, case_no, starts_at, status, referral_type, price, payer, firm_id, patient_name, service_label, mode, firms(name)').gte('starts_at', from).order('starts_at').range(x, y)),
    // all payments (also ones made before the window, e.g. prepayments), so balances are right
    fetchAll<RepPay>((x, y) => supabase.from('payments').select('appointment_id, amount, paid_on, method').order('created_at').range(x, y)),
    fetchAll<RepLetter>((x, y) => supabase.from('letters').select('appointment_id, finalized_at').eq('is_final', true).order('appointment_id').range(x, y)),
  ]);
  const appts: RepAppt[] = a.map(({ firms, ...x }) => ({ ...x, price: Number(x.price), firm_name: firms?.name ?? '' }));
  return <ReportsView report={buildReport(appts, p.map((x) => ({ ...x, amount: Number(x.amount) })), l, today)} />;
}
