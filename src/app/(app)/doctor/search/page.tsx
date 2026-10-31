import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import Icon from '@/components/Icon';
import { Empty, PageHead } from '@/components/ui';
import { StatusBadge, TypeBadge } from '@/components/Badges';
import { fmtDate, ilParts } from '@/lib/dates';
import type { ApptRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Row = ApptRow & { patient_id_number: string; patient_phone: string; patient_dob: string | null; patient_email: string | null; firms: { name: string } | null };

const newDoc = (r: Row, what: 'letter' | 'rx') => `/doctor/new?${new URLSearchParams({ what, name: r.patient_name || '', id: r.patient_id_number || '', dob: r.patient_dob || '', phone: r.patient_phone || '', email: r.patient_email || '' })}`;
const COLS = 'id, case_no, starts_at, referral_type, patient_name, patient_id_number, patient_phone, patient_dob, patient_email, service_label, status, payer, price, firms(name)';

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q: raw = '' } = await searchParams;
  const { supabase } = await requireUser(['doctor', 'admin']);
  // keep only characters that are safe inside a PostgREST filter
  const q = raw.replace(/[^\p{L}\p{N}\s״׳\-.@]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  let rows: Row[] = [];
  if (q.length >= 2) {
    const like = `%${q.replace(/[%_]/g, '')}%`;
    const digits = q.replace(/\D/g, '');
    const { data: firms } = await supabase.from('firms').select('id').ilike('name', like).limit(50);
    const ors = [`patient_name.ilike.${like}`, `notes.ilike.${like}`];
    if (digits.length >= 3) ors.push(`patient_id_number.ilike.%${digits}%`, `patient_phone.ilike.%${digits}%`);
    if (/^\d{3,9}$/.test(q)) ors.push(`case_no.eq.${q}`);
    const ids = (firms ?? []).map((f) => f.id as string);
    if (ids.length) ors.push(`firm_id.in.(${ids.join(',')})`);
    const { data } = await supabase.from('appointments').select(COLS).eq('provisional', false).or(ors.join(',')).order('starts_at', { ascending: false }).limit(200);
    rows = (data as unknown as Row[] | null) ?? [];
  }
  // group by patient (ID number), so each person appears once with all their visits
  const people = new Map<string, Row[]>();
  for (const r of rows) people.set(r.patient_id_number, [...(people.get(r.patient_id_number) ?? []), r]);
  return (
    <>
      <PageHead title="חיפוש" sub="לפי שם מטופל, ת״ז, טלפון, מספר תיק, שם מפנה או מילה מתוך הבקשה" />
      <form className="search-big" action="/doctor/search" role="search">
        <Icon name="search" />
        <input name="q" defaultValue={raw} placeholder="למשל: כהן · 012345678 · 1046 · עו״ד לוי" autoFocus aria-label="חיפוש" />
        <button className="btn btn-primary" type="submit">חיפוש</button>
      </form>
      <p className="hint"><Icon name="info" size={14} />מטופל חדש שלא במערכת? <Link href="/doctor/new">מסמך או מרשם חדש</Link></p>
      {q.length >= 2 && (rows.length === 0 ? <section className="panel"><Empty icon="search">לא נמצאו תוצאות ל״{q}״</Empty></section> : (
        <div className="stack">
          <p className="hint">{people.size} מטופלים · {rows.length} תיקים</p>
          {[...people.entries()].map(([pid, list]) => (
            <section className="panel flush" key={pid}>
              <div className="panel-head">
                <h2><Icon name="user" />{list[0].patient_name}</h2>
                <span className="hint num">ת״ז {pid} · <span className="ltr">{list[0].patient_phone}</span> · {list.length === 1 ? 'תיק אחד' : `${list.length} תיקים`}</span>
              </div>
              <div className="row patient-actions">
                <Link className="btn btn-sm" href={newDoc(list[0], 'letter')}><Icon name="file" />מכתב חדש</Link>
                <Link className="btn btn-sm" href={newDoc(list[0], 'rx')}><Icon name="pill" />מרשם חדש</Link>
              </div>
              <div className="list">
                {list.map((r) => (
                  <Link key={r.id} href={`/doctor/cases/${r.id}`} className="item" style={{ gridTemplateColumns: '90px minmax(0,1fr) auto' }}>
                    <span className="item-time num">{fmtDate(ilParts(r.starts_at).date)}<small>תיק {r.case_no}</small></span>
                    <span className="item-main"><span className="row" style={{ gap: 6 }}><TypeBadge type={r.referral_type} label={r.service_label} /></span><span className="item-meta">{r.firms?.name}</span></span>
                    <StatusBadge status={r.status} staff />
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      ))}
    </>
  );
}
