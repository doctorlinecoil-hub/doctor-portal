import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import Icon from '@/components/Icon';
import { Empty, PageHead } from '@/components/ui';
import { typeOf } from '@/lib/constants';
import { fmtDate, fmtStamp } from '@/lib/dates';
import type { RxItem } from '@/lib/rxTypes';

export const dynamic = 'force-dynamic';

type Appt = { id: string; case_no: number; patient_name: string; patient_id_number: string; service_label: string | null; firms: { name: string } | null };
type LetterRow = { appointment_id: string; letter_type: string; subject: string; final_subject: string | null; is_final: boolean; finalized_at: string | null; updated_at: string; body: string; appointments: Appt };
type RxRowJ = { id: string; appointment_id: string; rx_no: number | null; rx_date: string; items: RxItem[]; sent_at: string | null; appointments: Appt };
type Doc = { key: string; kind: 'letter' | 'rx'; when: string; appt: Appt; title: string; sub: string; final: boolean; href: string; pdf: string };

const APPT = 'appointments!inner(id, case_no, patient_name, patient_id_number, service_label, firms(name))';

/**
 * Every document the doctor wrote (letters, opinions, prescriptions), newest first, with a search by patient:
 * open to edit (a final letter can be updated and sent again), or open the PDF.
 */
export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ q?: string; t?: string }> }) {
  const { q: raw = '', t = 'all' } = await searchParams;
  const { supabase } = await requireUser(['doctor', 'admin']);
  const q = raw.replace(/[^\p{L}\p{N}\s״׳\-.]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const digits = q.replace(/\D/g, '');
  const filter = q.length >= 2
    ? [`patient_name.ilike.${like}`, ...(digits.length >= 3 ? [`patient_id_number.ilike.%${digits}%`] : []), ...(/^\d{3,9}$/.test(q) ? [`case_no.eq.${q}`] : [])].join(',')
    : '';

  const lq = supabase.from('letters').select(`appointment_id, letter_type, subject, final_subject, is_final, finalized_at, updated_at, body, ${APPT}`).order('updated_at', { ascending: false }).limit(200);
  const rq = supabase.from('prescriptions').select(`id, appointment_id, rx_no, rx_date, items, sent_at, ${APPT}`).order('created_at', { ascending: false }).limit(200);
  const [{ data: letters }, { data: rxs }] = await Promise.all([
    t === 'rx' ? Promise.resolve({ data: [] }) : filter ? lq.or(filter, { referencedTable: 'appointments' }) : lq,
    t === 'letter' ? Promise.resolve({ data: [] }) : filter ? rq.or(filter, { referencedTable: 'appointments' }) : rq,
  ]);

  const docs: Doc[] = [
    ...((letters as unknown as LetterRow[] | null) ?? []).filter((l) => l.is_final || String(l.body || '').replace(/<[^>]+>/g, '').trim()).map((l) => ({
      key: `l-${l.appointment_id}`, kind: 'letter' as const, when: l.updated_at, appt: l.appointments,
      title: l.appointments.service_label || typeOf(l.letter_type).label,
      sub: (l.final_subject || l.subject || '').slice(0, 120),
      final: l.is_final, href: `/doctor/cases/${l.appointment_id}#letter`, pdf: `/letters/${l.appointment_id}/print${l.is_final ? '' : '?v=draft'}`,
    })),
    ...((rxs as unknown as RxRowJ[] | null) ?? []).map((r) => ({
      key: `r-${r.id}`, kind: 'rx' as const, when: r.rx_date, appt: r.appointments,
      title: `מרשם${r.rx_no ? ` ${r.rx_no}` : ''}`,
      sub: (r.items ?? []).map((i) => i.name).join(' · ').slice(0, 120),
      final: true, href: `/doctor/cases/${r.appointment_id}#rx`, pdf: `/rx/${r.id}/print`,
    })),
  ].sort((a, b) => String(b.when).localeCompare(String(a.when)));

  const tab = (key: string, label: string) => (
    <Link href={`/doctor/documents?${new URLSearchParams({ ...(raw ? { q: raw } : {}), t: key })}`} className={`seg-link${t === key ? ' on' : ''}`} aria-current={t === key ? 'page' : undefined}>{label}</Link>
  );

  return (
    <>
      <PageHead title="מסמכים" sub="כל המכתבים, חוות הדעת והמרשמים. בוחרים מטופל ופותחים לעריכה, גם מסמך שכבר נשלח." />
      <form className="search-big" action="/doctor/documents" role="search">
        <Icon name="search" />
        <input name="q" defaultValue={raw} placeholder="שם מטופל, ת״ז או מספר תיק" aria-label="חיפוש מסמך" />
        {t !== 'all' && <input type="hidden" name="t" value={t} />}
        <button className="btn btn-primary" type="submit">חיפוש</button>
      </form>
      <div className="docs-bar">
        <nav className="seg-links" aria-label="סוג מסמך">{tab('all', 'הכל')}{tab('letter', 'מכתבים וחוות דעת')}{tab('rx', 'מרשמים')}</nav>
        <span className="hint">{docs.length} מסמכים{q.length >= 2 ? ` עבור ״${q}״` : ''}</span>
        <Link className="btn btn-sm" href="/doctor/new"><Icon name="plus" size={15} />מסמך חדש</Link>
      </div>
      {docs.length === 0 ? <section className="panel"><Empty icon="file">{q.length >= 2 ? `לא נמצאו מסמכים עבור ״${q}״` : 'עוד לא נכתבו מסמכים'}</Empty></section> : (
        <section className="panel flush">
          <div className="doc-table" role="table" aria-label="מסמכים">
            <div className="doc-tr doc-th" role="row"><span role="columnheader">מסמך</span><span role="columnheader">מטופל</span><span role="columnheader">עודכן</span><span role="columnheader">מצב</span><span role="columnheader" /></div>
            {docs.map((d) => (
              <div key={d.key} className="doc-tr" role="row">
                <span role="cell" className="doc-name">
                  <span className={`doc-ic ${d.kind}`}><Icon name={d.kind === 'rx' ? 'pill' : 'file'} size={17} /></span>
                  <span><b>{d.title}</b>{d.sub && <small>{d.sub}</small>}</span>
                </span>
                <span role="cell"><b>{d.appt.patient_name}</b><small className="num">ת״ז {d.appt.patient_id_number} · תיק {d.appt.case_no}{d.appt.firms?.name ? ` · ${d.appt.firms.name}` : ''}</small></span>
                <span role="cell" className="num">{d.kind === 'rx' ? fmtDate(d.when) : fmtStamp(d.when)}</span>
                <span role="cell">{d.final ? <span className="badge b-done">{d.kind === 'rx' ? 'הופק' : 'סופי · נשלח'}</span> : <span className="badge b-draft">טיוטה</span>}</span>
                <span role="cell" className="doc-acts">
                  <Link className="btn btn-sm btn-primary" href={d.href}><Icon name="file" size={15} />{d.kind === 'rx' ? 'פתיחה' : 'עריכה'}</Link>
                  <a className="btn btn-sm" href={d.pdf} target="_blank" rel="noopener"><Icon name="printer" size={15} />PDF</a>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
