import { requireUser } from '@/lib/auth';
import { loadAppointments } from '@/lib/queries';
import { todayIL } from '@/lib/dates';
import { PaymentsView } from '@/views/PaymentsView';

export const dynamic = 'force-dynamic';

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  const { f, q } = await searchParams;
  const { supabase } = await requireUser(['admin']);
  const today = todayIL();
  const [rows, { data: month }] = await Promise.all([
    loadAppointments(supabase, { order: 'desc', limit: 3000 }),
    supabase.from('payments').select('amount').gte('paid_on', today.slice(0, 8) + '01'),
  ]);
  const collected = (month ?? []).reduce((s, p) => s + Number(p.amount), 0);
  return <PaymentsView rows={rows} filter={f || 'open'} q={q || ''} collectedThisMonth={collected} />;
}
