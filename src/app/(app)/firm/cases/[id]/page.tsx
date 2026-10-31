import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import type { CaseDetail, DocRow, NoteRow, PaymentRow } from '@/lib/types';
import { FirmCaseView } from '@/views/FirmViews';
import Icon from '@/components/Icon';
import CaseActions from './CaseActions';
import ForwardLetter from './ForwardLetter';
import FirmPayBox from './FirmPayBox';
import { payLines } from '@/lib/constants';
import RescheduleRequest, { type MyReschedule } from './RescheduleRequest';
import { availableSlots, type Busy } from '@/lib/slots';
import { DAYS, changeDeadline, fmtDate, todayIL, weekday } from '@/lib/dates';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export default async function FirmCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile, settings } = await requireUser(['firm']);
  const { data: a } = await supabase.from('appointments').select('*, firm:firms(id, name, kind, contact_name, phone, email, tax_id)').eq('id', id).maybeSingle();
  if (!a) notFound();
  const [{ data: notes }, { data: docs }, { data: fin }, { data: pays }] = await Promise.all([
    supabase.from('case_notes').select('id, body, created_at, kind, resolved_at').eq('appointment_id', id).order('created_at'),
    supabase.from('documents').select('id, file_name, mime_type, size_bytes, created_at').eq('appointment_id', id).order('created_at'),
    supabase.rpc('final_letter', { p_id: id }),
    supabase.rpc('case_payments', { p_id: id }),
  ]);
  const final = Array.isArray(fin) && fin.length ? fin[0] : null;
  const payments = ((pays as PaymentRow[] | null) ?? []).map((p) => ({ ...p, amount: Number(p.amount) }));
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const c = { ...a, price: Number(a.price) } as unknown as CaseDetail;
  // a confirmed appointment can be moved or cancelled until N business days before it; a pending request anytime
  const days = settings.change_business_days ?? 5;
  const deadline = changeDeadline(c.starts_at, days);
  const late = (c.status === 'booked' || c.status === 'draft') && todayIL() > deadline;
  const movable = canCancel0(c) && !late;
  let slots: ReturnType<typeof availableSlots> = [];
  let last: MyReschedule = null;
  if (movable) {
    const now = new Date();
    const until = new Date(now.getTime() + (settings.horizon_days + 2) * 86400000);
    const [{ data: busy }, { data: rq }] = await Promise.all([
      supabase.rpc('busy_slots', { p_from: now.toISOString(), p_to: until.toISOString() }),
      supabase.from('reschedule_requests').select('status, requested_starts_at, response, created_at').eq('appointment_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    slots = availableSlots(settings, (busy as Busy[] | null) ?? [], now);
    last = (rq as MyReschedule) ?? null;
  }
  const dep = Number((a as { deposit_amount?: number }).deposit_amount) || 0;
  const depPaid = !!(a as { deposit_paid_at?: string | null }).deposit_paid_at;
  const proof = !!(a as { deposit_proof_at?: string | null }).deposit_proof_at;
  const due = Math.max(0, c.price - paid);
  const pay = payLines(settings);
  const payBox = c.status === 'pending' && dep > 0 && !depPaid
    ? <FirmPayBox appointmentId={id} firmId={profile.firm_id!} mode="deposit" amount={dep} pay={pay} holdHours={settings.deposit_hold_hours} sent={proof} />
    : (c.status === 'booked' || c.status === 'draft' || c.status === 'done') && due > 0 && (pay.bank.length > 0 || !!pay.bit)
      ? <FirmPayBox appointmentId={id} firmId={profile.firm_id!} mode="balance" amount={due} pay={pay} sent={!!(a as { pay_proof_at?: string | null }).pay_proof_at} />
      : null;
  const canCancel = (c.status === 'pending' || c.status === 'booked' || c.status === 'draft') && new Date(c.starts_at).getTime() > Date.now() && !late;
  const showRule = days > 0 && (c.status === 'booked' || c.status === 'draft') && new Date(c.starts_at).getTime() > Date.now();
  return (
    <FirmCaseView
      c={c}
      notes={(notes as NoteRow[]) ?? []}
      docs={(docs as DocRow[]) ?? []}
      payments={payments}
      paid={paid}
      letter={{ ready: !!final, awaitingPayment: c.status === 'done' && !final, finalizedAt: final?.finalized_at ?? null }}
      forward={final ? <ForwardLetter appointmentId={id} /> : null}
      payBox={payBox}
      actions={<>
        {showRule && (
          <p className={`change-rule${late ? ' late' : ''}`}>
            <Icon name={late ? 'info' : 'clock'} size={15} />
            {late
              ? <>שינוי מועד או ביטול אפשריים עד {days} ימי עסקים לפני התור, והמועד הזה עבר. לשינוי צרו קשר עם המרפאה{settings.lh_phone ? <>: <a href={`tel:${settings.lh_phone}`} dir="ltr">{settings.lh_phone}</a></> : '.'}</>
              : <>אפשר לשנות מועד או לבטל עד יום {DAYS[weekday(deadline)]} {fmtDate(deadline)} ({days} ימי עסקים לפני התור).</>}
          </p>
        )}
        {movable && <RescheduleRequest appointmentId={id} firmId={profile.firm_id!} slots={slots} last={last} />}
        {c.details_at && c.status !== 'done' && c.status !== 'cancelled' && <a className="btn btn-sm" href={`/firm/cases/${id}/details`} style={{ alignSelf: 'flex-start' }}><Icon name="user" />עריכת פרטי המטופל</a>}
        <CaseActions appointmentId={id} firmId={profile.firm_id!} canAdd={c.status !== 'cancelled'} canCancel={canCancel} />
      </>}
    />
  );
}

function canCancel0(c: CaseDetail) {
  return (c.status === 'pending' || c.status === 'booked' || c.status === 'draft') && new Date(c.starts_at).getTime() > Date.now();
}
