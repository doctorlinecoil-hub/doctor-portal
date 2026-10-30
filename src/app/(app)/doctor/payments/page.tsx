import { requireUser } from '@/lib/auth';
import { loadAppointments } from '@/lib/queries';
import { PendingPayView, type PayLine } from '@/views/PendingPayView';
import { released } from '@/lib/types';
import { todayIL } from '@/lib/dates';
import ApprovePay from './ApprovePay';

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
  const pays: Record<string, PayLine[]> = {};
  for (const x of (p as (PayLine & { appointment_id: string })[] | null) ?? []) (pays[x.appointment_id] ??= []).push({ amount: Number(x.amount), method: x.method, paid_on: x.paid_on });
  return (
    <PendingPayView waiting={waiting} approved={approved} gate={gate} pays={pays}
      action={(r, undo) => <ApprovePay id={r.id} today={today} undo={undo} due={Math.max(0, r.price - r.paid)} paidInFull={r.price > 0 && r.paid + 0.001 >= r.price} />} />
  );
}
