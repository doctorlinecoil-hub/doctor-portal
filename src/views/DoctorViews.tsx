import Link from 'next/link';
import Icon from '@/components/Icon';
import { Empty, PageHead, Stat } from '@/components/ui';
import { KindBadge, StatusBadge } from '@/components/Badges';
import { TYPES, ils } from '@/lib/constants';
import { dayNum, fmtDate, fmtDay, ilParts, todayIL } from '@/lib/dates';
import type { ApptRow, CaseDetail, DocRow, NoteRow } from '@/lib/types';
import { ApptItem, CaseHero, DocsPanel, NotesPanel, groupByDay } from './FirmViews';

function greeting(now = new Date()) {
  const h = +ilParts(now).time.slice(0, 2);
  return h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : 'ערב טוב';
}

export function DoctorAgendaView({ rows, past, isAdmin, name, now = new Date() }: { rows: ApptRow[]; past: boolean; isAdmin: boolean; name: string; now?: Date }) {
  const today = todayIL();
  const active = rows.filter((r) => r.status !== 'cancelled');
  const day = (r: ApptRow) => dayNum(ilParts(r.starts_at).date) - dayNum(today);
  const todays = active.filter((r) => day(r) === 0);
  const week = active.filter((r) => day(r) >= 0 && day(r) < 7);
  const waiting = active.filter((r) => (r.status === 'booked' || r.status === 'draft') && new Date(r.starts_at) < now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const outstanding = active.reduce((s, r) => s + Math.max(0, r.price - r.paid), 0);
  const list = past
    ? active.filter((r) => day(r) < 0).sort((a, b) => b.starts_at.localeCompare(a.starts_at))
    : active.filter((r) => day(r) >= 0).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return (
    <>
      <PageHead title={`${greeting(now)}, ${name}`} sub={`${fmtDay(today)} · ${fmtDate(today)}`} />
      <div className="stats">
        <Stat icon="calendar" label="תורים היום" value={todays.length} tone="info" />
        <Stat icon="clock" label="ב־7 הימים הקרובים" value={week.length} />
        <Stat icon="file" label="ממתינים למכתב" value={waiting.length} tone="warn" />
        {isAdmin ? <Stat icon="wallet" label="יתרה לגבייה" value={ils(outstanding)} tone="bad" />
          : <Stat icon="fileCheck" label="מכתבים שנשלחו" value={active.filter((r) => r.status === 'done').length} tone="ok" />}
      </div>
      <div className="cols-side">
        <section className="panel flush">
          <div className="panel-head">
            <h2><Icon name="calendar" />{past ? 'ביקורים קודמים' : 'יומן תורים'}</h2>
            <nav className="tabs" aria-label="תצוגה" style={{ boxShadow: 'none' }}>
              <Link href="/doctor" aria-current={!past}>קרובים</Link>
              <Link href="/doctor?view=past" aria-current={past}>עבר</Link>
            </nav>
          </div>
          {list.length === 0 ? <Empty icon="calendar">{past ? 'אין ביקורים קודמים.' : 'אין תורים קרובים. כשמפנה יקבע תור, הוא יופיע כאן.'}</Empty> : (
            <div className="list">
              {groupByDay(list.slice(0, 120)).map((g) => (
                <div key={g.date}>
                  <div className="list-day">{fmtDay(g.date)} <span>{fmtDate(g.date)} · {g.rows.length} תורים</span></div>
                  {g.rows.map((r) => <ApptItem key={r.id} r={r} href={`/doctor/cases/${r.id}`} staff />)}
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="panel flush">
          <div className="panel-head"><h2><Icon name="file" />ממתינים למכתב</h2><span className="hint">{waiting.length}</span></div>
          {waiting.length === 0 ? <Empty icon="checkCircle">אין ביקורים שממתינים למכתב</Empty> : (
            <div className="list">
              {waiting.slice(0, 12).map((r) => (
                <Link key={r.id} href={`/doctor/cases/${r.id}`} className="item" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                  <span className="item-main"><b>{r.patient_name}</b><span className="item-meta">{TYPES[r.referral_type].label} · {fmtDate(ilParts(r.starts_at).date)}</span></span>
                  <StatusBadge status={r.status} staff />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

export function DoctorCaseView({ c, notes, docs, payment, letter, cancel }: {
  c: CaseDetail; notes: NoteRow[]; docs: DocRow[]; payment?: React.ReactNode; letter: React.ReactNode; cancel?: React.ReactNode;
}) {
  return (
    <>
      <PageHead title="" crumbs={[{ href: '/doctor', label: 'יומן ותיקים' }]} />
      <CaseHero c={c} staff>
        <div className="hint row" style={{ gap: 6 }}><KindBadge kind={c.firm.kind} /><b style={{ color: 'var(--fg)', fontWeight: 500 }}>{c.firm.name}</b></div>
        <div className="hint">{[c.firm.contact_name, c.firm.phone].filter(Boolean).join(' · ')}</div>
        {cancel}
      </CaseHero>
      <div className="cols">
        <div className="stack">
          <NotesPanel notes={c.notes} extra={notes} />
          <DocsPanel docs={docs} open />
          {payment}
        </div>
        <div className="stack">{letter}</div>
      </div>
    </>
  );
}

export function payerName(c: CaseDetail) {
  return c.payer === 'patient' ? `${c.patient_name} (המטופל)` : c.firm.name;
}

