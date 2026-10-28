import Link from 'next/link';
import Icon from '@/components/Icon';
import Tabs from '@/components/Tabs';
import { Empty, PageHead, Stat } from '@/components/ui';
import { KindBadge, StatusBadge } from '@/components/Badges';
import { TYPES, ils } from '@/lib/constants';
import { DAYS, dayNum, fmtDate, fmtDay, ilParts, todayIL, weekday } from '@/lib/dates';
import type { ApptRow, CaseDetail, DocRow, NoteRow } from '@/lib/types';
import { ApptItem, CaseHero, DocsPanel, NotesPanel, groupByDay } from './FirmViews';

function greeting(now = new Date()) {
  const h = +ilParts(now).time.slice(0, 2);
  return h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : 'ערב טוב';
}

export type IntakeChip = { status: string; readiness: number; flags: number; missing: number };

function AiChip({ i }: { i?: IntakeChip }) {
  if (!i) return null;
  if (i.status === 'queued' || i.status === 'running') return <span className="ai-chip run"><Icon name="sparkles" size={13} />סורק…</span>;
  if (i.status !== 'done') return null;
  const tone = i.readiness >= 80 ? 'ok' : i.readiness >= 50 ? 'warn' : 'bad';
  return (
    <span className={`ai-chip ${tone}`} title="סריקת AI: שלמות התיק, דגלים ומסמכים חסרים">
      <Icon name="sparkles" size={13} />{i.readiness}%{i.flags > 0 && <> · {i.flags} דגלים</>}{i.missing > 0 && <> · חסרים {i.missing}</>}
    </span>
  );
}

export function DoctorAgendaView({ rows, past, isAdmin, name, now = new Date(), intake = {}, openRequests = 0, approvals, reschedules = [], setup }: {
  rows: ApptRow[]; past: boolean; isAdmin: boolean; name: string; now?: Date; intake?: Record<string, IntakeChip>; openRequests?: number;
  approvals?: (id: string) => React.ReactNode;
  reschedules?: React.ReactNode[];
  setup?: React.ReactNode;
}) {
  const today = todayIL();
  const active = rows.filter((r) => r.status !== 'cancelled');
  const day = (r: ApptRow) => dayNum(ilParts(r.starts_at).date) - dayNum(today);
  // all open requests, including ones whose time already passed (so they can still be declined)
  const pending = active.filter((r) => r.status === 'pending').sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const confirmed = active.filter((r) => r.status !== 'pending');
  const todays = confirmed.filter((r) => day(r) === 0).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const next = todays.find((r) => new Date(r.starts_at) >= now) ?? confirmed.filter((r) => new Date(r.starts_at) >= now).sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
  const week = confirmed.filter((r) => day(r) >= 0 && day(r) < 7);
  const waiting = confirmed.filter((r) => (r.status === 'booked' || r.status === 'draft') && new Date(r.starts_at) < now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const outstanding = active.reduce((s, r) => s + Math.max(0, r.price - r.paid), 0);
  const list = past
    ? confirmed.filter((r) => day(r) < 0).sort((a, b) => b.starts_at.localeCompare(a.starts_at))
    : confirmed.filter((r) => day(r) >= 0).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const np = next ? ilParts(next.starts_at) : null;
  return (
    <>
      <section className="hero">
        <div>
          <span className="hero-date">יום {DAYS[weekday(today)]} · {fmtDate(today)}</span>
          <h1>{greeting(now)}, {name}</h1>
          <p>
            {todays.length ? `היום ${todays.length === 1 ? 'תור אחד' : `${todays.length} תורים`}` : 'אין תורים היום'}
            {pending.length ? ` · ${pending.length === 1 ? 'בקשה חדשה ממתינה' : `${pending.length} בקשות חדשות ממתינות`} לאישורך` : ''}
            {waiting.length ? ` · ${waiting.length} ממתינים למכתב` : ''}
          </p>
        </div>
        {next && np && (
          <Link href={`/doctor/cases/${next.id}`} className="hero-next">
            <span className="hint">התור הבא</span>
            <b>{next.patient_name}</b>
            <span>{fmtDay(np.date)} · <span className="num">{np.time}</span> · {TYPES[next.referral_type].label}</span>
            <AiChip i={intake[next.id]} />
          </Link>
        )}
      </section>
      {setup}
      <div className="stats">
        <Stat icon="inbox" label="בקשות לאישור" value={pending.length + reschedules.length} tone={pending.length ? 'warn' : 'violet'} href="#approvals" />
        <Stat icon="calendar" label="תורים השבוע" value={week.length} tone="info" sub={todays.length ? `${todays.length} היום` : undefined} />
        <Stat icon="file" label="ממתינים למכתב" value={waiting.length} tone={waiting.length ? 'bad' : 'ok'} sub={openRequests ? `${openRequests} בקשות מסמכים פתוחות` : undefined} />
        {isAdmin ? <Stat icon="wallet" label="יתרה לגבייה" value={ils(outstanding)} tone="bad" href="/admin/payments" />
          : <Stat icon="fileCheck" label="מכתבים שנשלחו" value={active.filter((r) => r.status === 'done').length} tone="ok" />}
      </div>

      {pending.length > 0 && (
        <section className="panel flush approvals" id="approvals">
          <div className="panel-head"><h2><Icon name="inbox" />בקשות חדשות לאישור</h2><span className="badge b-pending">{pending.length}</span></div>
          <div className="req-list">
            {pending.map((r) => {
              const p = ilParts(r.starts_at);
              return (
                <div className="req" key={r.id}>
                  <Link href={`/doctor/cases/${r.id}`} className="req-main">
                    <span className="req-when"><b className="num">{p.time}</b><small>{fmtDay(p.date)}</small></span>
                    <span className="item-main">
                      <b>{r.patient_name}</b>
                      <span className="item-meta"><span>{TYPES[r.referral_type].label}</span><span>·</span><span>{r.firm_name}</span><span>·</span><span className="num">תיק {r.case_no}</span></span>
                      {new Date(r.starts_at) < now ? <span className="badge b-cancelled">המועד עבר · כדאי לדחות ולבקש מועד חדש</span> : <AiChip i={intake[r.id]} />}
                    </span>
                  </Link>
                  <div className="req-actions">{approvals?.(r.id)}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {reschedules.length > 0 && (
        <section className="panel approvals">
          <div className="panel-head"><h2><Icon name="calendar" />בקשות לשינוי מועד</h2><span className="badge b-pending">{reschedules.length}</span></div>
          <div className="stack-sm">{reschedules}</div>
        </section>
      )}

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
                  {g.rows.map((r) => <ApptItem key={r.id} r={r} href={`/doctor/cases/${r.id}`} staff extra={<AiChip i={intake[r.id]} />} />)}
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

export type HistoryRow = { id: string; case_no: number; starts_at: string; referral_type: CaseDetail['referral_type']; status: CaseDetail['status']; firm_name: string };

export function PatientHistory({ rows }: { rows: HistoryRow[] }) {
  if (!rows.length) return null;
  return (
    <section className="panel flush">
      <div className="panel-head"><h2><Icon name="timeline" />ביקורים קודמים של המטופל</h2><span className="hint">{rows.length}</span></div>
      <div className="list">
        {rows.map((r) => (
          <Link key={r.id} href={`/doctor/cases/${r.id}`} className="item" style={{ gridTemplateColumns: '84px minmax(0,1fr) auto' }}>
            <span className="item-time num" style={{ fontSize: 14 }}>{fmtDate(ilParts(r.starts_at).date)}<small>תיק {r.case_no}</small></span>
            <span className="item-main"><b>{TYPES[r.referral_type].label}</b><span className="item-meta">{r.firm_name}</span></span>
            <StatusBadge status={r.status} staff />
          </Link>
        ))}
      </div>
    </section>
  );
}

export function DoctorCaseView({ c, notes, docs, payment, letter, cancel, intake, comms, approval, resolve, history, reschedule }: {
  c: CaseDetail; notes: NoteRow[]; docs: DocRow[]; payment?: React.ReactNode; letter: React.ReactNode; cancel?: React.ReactNode;
  intake?: React.ReactNode; comms?: React.ReactNode; approval?: React.ReactNode; resolve?: (n: NoteRow) => React.ReactNode;
  history?: React.ReactNode; reschedule?: React.ReactNode;
}) {
  const openReq = notes.filter((n) => n.kind === 'request' && !n.resolved_at).length;
  return (
    <>
      <PageHead title="" crumbs={[{ href: '/doctor', label: 'יומן ותיקים' }]} />
      <CaseHero c={c} staff>
        <div className="hint row" style={{ gap: 6 }}><KindBadge kind={c.firm.kind} /><b style={{ color: 'var(--fg)', fontWeight: 500 }}>{c.firm.name}</b></div>
        <div className="hint">{[c.firm.contact_name, c.firm.phone].filter(Boolean).join(' · ')}</div>
        {c.patient_email && <div className="hint row" style={{ gap: 6 }}><Icon name="mail" size={14} /><span className="ltr">{c.patient_email}</span></div>}
        {cancel}
      </CaseHero>
      {c.status === 'pending' && approval && (
        <section className="approval-bar">
          <div className="approval-text"><span className="pulse" aria-hidden="true" /><div><b>בקשה חדשה ממתינה לאישורך</b><span>אחרי האישור יישלח זימון במייל {c.patient_email ? 'למטופל ולמפנה' : 'למפנה'}, עם קובץ ליומן וקישור לניווט.</span></div></div>
          {approval}
        </section>
      )}
      {reschedule}
      {c.status === 'cancelled' && c.decline_reason && <div className="callout bad"><div><Icon name="x" />הבקשה נדחתה: {c.decline_reason}</div></div>}
      {openReq > 0 && <div className="callout warn"><div><Icon name="flag" />{openReq === 1 ? 'בקשה אחת פתוחה' : `${openReq} בקשות פתוחות`} למפנה להשלמת מסמכים.</div></div>}
      <Tabs
        initial={c.status === 'draft' || c.status === 'done' ? 'letter' : 'overview'}
        tabs={[
          { key: 'overview', label: 'סקירת התיק', icon: 'sparkles', badge: openReq || null, content: (
            <div className="cols case-cols">
              <div className="stack">{intake}</div>
              <div className="stack">
                <NotesPanel notes={c.notes} extra={notes} resolve={resolve} />
                <DocsPanel docs={docs} open />
                {history}
              </div>
            </div>
          ) },
          { key: 'letter', label: 'המכתב', icon: 'file', content: <div className="letter-wrap">{letter}</div> },
          { key: 'send', label: comms && payment ? 'שליחה ותשלום' : 'זימונים ושליחה', icon: 'send', content: (
            <div className="cols case-cols">
              <div className="stack">{comms}</div>
              <div className="stack">{payment}</div>
            </div>
          ) },
        ].filter((t) => t.key !== 'send' || comms || payment)}
      />
    </>
  );
}

export function payerName(c: CaseDetail) {
  return c.payer === 'patient' ? `${c.patient_name} (המטופל)` : c.firm.name;
}

