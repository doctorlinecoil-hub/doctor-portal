import type { Metadata } from 'next';
import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { SETTINGS_DEFAULTS, payLines, type Settings } from '@/lib/constants';
import { fmtDay, ilParts } from '@/lib/dates';
import Icon from '@/components/Icon';
import PayClient from './PayClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'תשלום · ד״ר אלרן חנוך', robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The link in the deposit email: payment details and the upload of the transfer confirmation. No sign-in. */
export default async function PayPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ k?: string }> }) {
  const { id } = await params;
  const { k = '' } = await searchParams;
  const db = createAdminClient();
  const { data: s0 } = await db.from('settings').select('*').eq('id', 1).single();
  const s = { ...SETTINGS_DEFAULTS, ...(s0 as Settings) } as Settings;
  type Row = { case_no: number; starts_at: string; status: string; deposit_amount: number; deposit_paid_at: string | null; deposit_proof_at: string | null; patient_name: string; service_label: string; price: number; payment_ok_at: string | null; pay_proof_at: string | null };
  let a: Row | null = null;
  let mode: 'deposit' | 'balance' = 'deposit';
  let due = 0;
  if (UUID.test(id) && /^[0-9a-f]{48}$/.test(k)) {
    const { data } = await db.from('appointments').select('case_no, starts_at, status, deposit_amount, deposit_paid_at, deposit_proof_at, patient_name, service_label, price, payment_ok_at, pay_proof_at, upload_key_hash, upload_key_expires, pay_key_hash, pay_key_expires').eq('id', id).maybeSingle();
    const h = createHash('sha256').update(k).digest('hex');
    const live = (exp: string | null) => !!exp && new Date(exp).getTime() > Date.now();
    if (data && data.pay_key_hash === h && live(data.pay_key_expires)) mode = 'balance';
    const ok = data && (mode === 'balance' || (data.upload_key_hash === h && live(data.upload_key_expires)));
    a = ok ? { ...data, deposit_amount: Number(data.deposit_amount), price: Number(data.price) } as Row : null;
    if (a && mode === 'balance') {
      const { data: pays } = await db.from('payments').select('amount').eq('appointment_id', id);
      due = Math.max(0, a.price - (pays ?? []).reduce((x, r) => x + Number(r.amount), 0));
    }
  }
  const p = a ? ilParts(a.starts_at) : null;
  return (
    <main className="pb">
      <header className="pb-head">
        <img src="/brand/letterhead.jpg" alt={s.lh_name} className="pb-banner" />
        <div className="pb-sub"><b>{mode === 'balance' ? 'תשלום ושליחת אישור העברה' : 'תשלום מקדמה'}</b><span>{[s.lh_address, s.lh_phone && `טל׳ ${s.lh_phone}`].filter(Boolean).join(' · ')}</span></div>
      </header>
      <section className="pb-card pb-done">
        {!a ? (
          <><span className="pb-check"><Icon name="alert" /></span><h1>הקישור לא תקף</h1><p className="pb-lead">ייתכן שפג תוקפו. אפשר לשלוח את אישור ההעברה למרפאה{s.lh_phone ? ` בוואטסאפ: ${s.lh_phone}` : ''}.</p><a className="btn" href="/book">קביעת תור חדש</a></>
        ) : a.status === 'cancelled' ? (
          <><span className="pb-check"><Icon name="x" /></span><h1>הבקשה בוטלה</h1><p className="pb-lead">אפשר לקבוע תור חדש בכל עת.</p><a className="btn btn-primary" href="/book">קביעת תור חדש</a></>
        ) : mode === 'balance' ? (
          a.payment_ok_at ? (
            <><span className="pb-check"><Icon name="checkCircle" /></span><h1>התשלום אושר</h1><p className="pb-lead">המסמך נשלח אליכם למייל כקובץ PDF. תודה!</p></>
          ) : (
            <>
              <h1>שלום{a.patient_name ? `, ${a.patient_name}` : ''}</h1>
              <p className="pb-lead">{a.service_label ? `${a.service_label} · ` : ''}תיק {a.case_no} · המסמך מוכן וממתין לתשלום</p>
              <PayClient id={id} k={k} amount={due} pay={payLines(s)} sent={!!a.pay_proof_at} mode="balance" />
            </>
          )
        ) : a.deposit_paid_at || !(a.deposit_amount > 0) ? (
          <><span className="pb-check"><Icon name="checkCircle" /></span><h1>המקדמה התקבלה</h1><p className="pb-lead">{a.status === 'pending' ? 'הרופא יאשר את התור בקרוב, ויישלח אליכם זימון במייל.' : 'התור מאושר. הזימון נשלח במייל.'}</p></>
        ) : (
          <>
            <h1>שלום {a.patient_name}</h1>
            <p className="pb-lead">{a.service_label ? `${a.service_label} · ` : ''}{p ? `${fmtDay(p.date)} · ${p.time}` : ''} · תיק {a.case_no}</p>
            <PayClient id={id} k={k} amount={a.deposit_amount} pay={payLines(s)} holdHours={s.deposit_hold_hours} sent={!!a.deposit_proof_at} />
          </>
        )}
      </section>
    </main>
  );
}
