import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { ReportsView } from '@/views/ReportsView';
import { PaymentsView } from '@/views/PaymentsView';
import Icon from '@/components/Icon';
import { PageHead } from '@/components/ui';
import { buildReport, type RepAppt, type RepLetter, type RepPay } from '@/lib/reports';
import { fetchAll } from '@/lib/fetchAll';
import { loadAppointments } from '@/lib/queries';
import { ilToUtc, todayIL } from '@/lib/dates';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Reports and collection in one place. Payment approval has its own page (/doctor/payments). */
export default async function MoneyPage({ searchParams }: { searchParams: Promise<{ tab?: string; f?: string; q?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireUser(['doctor', 'admin']);
  if (sp.tab === 'pending') redirect('/doctor/payments');
  const tab = sp.tab === 'collect' ? 'collect' : 'reports';
  const today = todayIL();
  let body: React.ReactNode;
  if (tab === 'collect') {
    const rows = await loadAppointments(supabase, { order: 'desc', limit: 3000 });
    const { data: month } = await supabase.from('payments').select('amount').gte('paid_on', today.slice(0, 8) + '01');
    const collected = (month ?? []).reduce((s, p) => s + Number(p.amount), 0);
    body = <PaymentsView bare rows={rows} filter={sp.f || 'open'} q={sp.q || ''} collectedThisMonth={collected} />;
  } else {
    const from = ilToUtc(`${+today.slice(0, 4) - 1}-${today.slice(5, 7)}-01`, '00:00').toISOString();
    const [a, p, l] = await Promise.all([
      fetchAll<RepAppt & { firms: { name: string } | null }>((x, y) => supabase.from('appointments')
        .select('id, case_no, starts_at, status, referral_type, price, payer, firm_id, patient_name, service_label, mode, firms(name)').eq('provisional', false).gte('starts_at', from).order('starts_at').range(x, y)),
      // all payments (also ones made before the window, e.g. prepayments), so balances are right
      fetchAll<RepPay>((x, y) => supabase.from('payments').select('appointment_id, amount, paid_on, method').order('created_at').range(x, y)),
      fetchAll<RepLetter>((x, y) => supabase.from('letters').select('appointment_id, finalized_at').eq('is_final', true).order('appointment_id').range(x, y)),
    ]);
    const appts: RepAppt[] = a.map(({ firms, ...x }) => ({ ...x, price: Number(x.price), firm_name: firms?.name ?? '' }));
    body = <ReportsView bare report={buildReport(appts, p.map((x) => ({ ...x, amount: Number(x.amount) })), l, today)} />;
  }

  return (
    <>
      <PageHead title="דוחות וגבייה" sub="הכנסות לאורך השנה, ומה שולם ומה פתוח.">
        <a className="btn" href="/api/export?what=payments"><Icon name="download" />תשלומים לאקסל</a>
        <a className="btn" href="/api/export?what=cases"><Icon name="download" />תיקים לאקסל</a>
      </PageHead>
      <nav className="pp-tabs" aria-label="תשלומים ודוחות">
        <Link href="/admin/reports" aria-current={tab === 'reports'}><Icon name="chart" size={17} />דוחות</Link>
        <Link href="/admin/reports?tab=collect" aria-current={tab === 'collect'}><Icon name="wallet" size={17} />גבייה ותשלומים</Link>
      </nav>
      {body}
    </>
  );
}
