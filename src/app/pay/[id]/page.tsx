import type { Metadata } from 'next';
import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { SETTINGS_DEFAULTS, payLines, type Settings } from '@/lib/constants';
import { fmtDay, ilParts } from '@/lib/dates';
import Icon from '@/components/Icon';
import PayClient from './PayClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'תשלום מקדמה · ד״ר אלרן חנוך', robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The link in the deposit email: payment details and the upload of the transfer confirmation. No sign-in. */
export default async function PayPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ k?: string }> }) {
  const { id } = await params;
  const { k = '' } = await searchParams;
  const db = createAdminClient();
  const { data: s0 } = await db.from('settings').select('*').eq('id', 1).single();
  const s = { ...SETTINGS_DEFAULTS, ...(s0 as Settings) } as Settings;
  let a: { case_no: number; starts_at: string; status: string; deposit_amount: number; deposit_paid_at: string | null; deposit_proof_at: string | null; patient_name: string; service_label: string } | null = null;
  if (UUID.test(id) && /^[0-9a-f]{48}$/.test(k)) {
    const { data } = await db.from('appointments').select('case_no, starts_at, status, deposit_amount, deposit_paid_at, deposit_proof_at, patient_name, service_label, upload_key_hash, upload_key_expires').eq('id', id).maybeSingle();
    const ok = data && data.upload_key_hash === createHash('sha256').update(k).digest('hex') && data.upload_key_expires && new Date(data.upload_key_expires).getTime() > Date.now();
    a = ok ? { ...data, deposit_amount: Number(data.deposit_amount) } : null;
  }
  const p = a ? ilParts(a.starts_at) : null;
  return (
    <main className="pb">
      <header className="pb-head">
        <img src="/brand/letterhead.jpg" alt={s.lh_name} className="pb-banner" />
        <div className="pb-sub"><b>תשלום מקדמה</b><span>{[s.lh_address, s.lh_phone && `טל׳ ${s.lh_phone}`].filter(Boolean).join(' · ')}</span></div>
      </header>
      <section className="pb-card pb-done">
        {!a ? (
          <><span className="pb-check"><Icon name="alert" /></span><h1>הקישור לא תקף</h1><p className="pb-lead">ייתכן שפג תוקפו. אפשר לשלוח את אישור ההעברה למרפאה{s.lh_phone ? ` בוואטסאפ: ${s.lh_phone}` : ''}.</p><a className="btn" href="/book">קביעת תור חדש</a></>
        ) : a.status === 'cancelled' ? (
          <><span className="pb-check"><Icon name="x" /></span><h1>הבקשה בוטלה</h1><p className="pb-lead">אפשר לקבוע תור חדש בכל עת.</p><a className="btn btn-primary" href="/book">קביעת תור חדש</a></>
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
