import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { ReportsView } from '@/views/ReportsView';
import { PaymentsView } from '@/views/PaymentsView';
import { PendingPayView } from '@/views/PendingPayView';
import Icon from '@/components/Icon';
import { PageHead } from '@/components/ui';
import { buildReport, type RepAppt, type RepLetter, type RepPay } from '@/lib/reports';
import { fetchAll } from '@/lib/fetchAll';
import { loadAppointments } from '@/lib/queries';
import { ilToUtc, todayIL } from '@/lib/dates';
import { released } from '@/lib/types';
import ApprovePay from './ApprovePay';

export const dynamic = 'force-dynamic';

/** Payments and reports in one place: documents waiting for payment approval, collection, and the charts. */
export default async function MoneyPage({ searchParams }: { searchParams: Promise<{ tab?: string; f?: string; q?: string }> }) {
  const sp = await searchParams;
  const { supabase, settings } = await requireUser(['doctor', 'admin']);
  const tab = sp.tab === 'collect' || sp.tab === 'reports' ? sp.tab : 'pending';
  const today = todayIL();
  const gate = settings.letter_requires_payment !== false;
  const rows = await loadAppointments(supabase, { order: 'desc', limit: 3000 });
  const waiting = rows.filter((r) => r.status === 'done' && !released(r, gate));
  const approved = rows.filter((r) => r.status === 'done' && !!r.payment_ok_at).sort((a, b) => (b.payment_ok_at || '').localeCompare(a.payment_ok_at || '')).slice(0, 8);

  let body: React.ReactNode;
  if (tab === 'pending') {
    body = <PendingPayView waiting={waiting} approved={approved} gate={gate} action={(id, undo) => <ApprovePay id={id} undo={undo} />} />;
  } else if (tab === 'collect') {
    const { data: month } = await supabase.from('payments').select('amount').gte('paid_on', today.slice(0, 8) + '01');
    const collected = (month ?? []).reduce((s, p) => s + Number(p.amount), 0);
    body = <PaymentsView bare rows={rows} filter={sp.f || 'open'} q={sp.q || ''} collectedThisMonth={collected} />;
  } else {
    const from = ilToUtc(`${+today.slice(0, 4) - 1}-${today.slice(5, 7)}-01`, '00:00').toISOString();
    const [a, p, l] = await Promise.all([
      fetchAll<RepAppt & { firms: { name: string } | null }>((x, y) => supabase.from('appointments')
        .select('id, case_no, starts_at, status, referral_type, price, payer, firm_id, patient_name, service_label, mode, firms(name)').gte('starts_at', from).order('starts_at').range(x, y)),
      // all payments (also ones made before the window, e.g. prepayments), so balances are right
      fetchAll<RepPay>((x, y) => supabase.from('payments').select('appointment_id, amount, paid_on, method').order('created_at').range(x, y)),
      fetchAll<RepLetter>((x, y) => supabase.from('letters').select('appointment_id, finalized_at').eq('is_final', true).order('appointment_id').range(x, y)),
    ]);
    const appts: RepAppt[] = a.map(({ firms, ...x }) => ({ ...x, price: Number(x.price), firm_name: firms?.name ?? '' }));
    body = <ReportsView bare report={buildReport(appts, p.map((x) => ({ ...x, amount: Number(x.amount) })), l, today)} />;
  }

  return (
    <>
      <PageHead title="תשלומים ודוחות" sub="אישור תשלומים ושחרור מסמכים, גבייה, והכנסות לאורך השנה.">
        <a className="btn" href="/api/export?what=payments"><Icon name="download" />תשלומים לאקסל</a>
        <a className="btn" href="/api/export?what=cases"><Icon name="download" />תיקים לאקסל</a>
      </PageHead>
      <nav className="pp-tabs" aria-label="תשלומים ודוחות">
        <Link href="/admin/reports" aria-current={tab === 'pending'}><Icon name="clock" size={17} />ממתינים לתשלום{waiting.length > 0 && <span className="pp-n">{waiting.length}</span>}</Link>
        <Link href="/admin/reports?tab=collect" aria-current={tab === 'collect'}><Icon name="wallet" size={17} />גבייה ותשלומים</Link>
        <Link href="/admin/reports?tab=reports" aria-current={tab === 'reports'}><Icon name="chart" size={17} />דוחות</Link>
      </nav>
      {body}
    </>
  );
}
