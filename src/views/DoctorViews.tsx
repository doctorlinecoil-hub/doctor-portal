import Link from 'next/link';
import Icon from '@/components/Icon';
import Tabs from '@/components/Tabs';
import { Empty, PageHead } from '@/components/ui';
import { KindBadge, StatusBadge } from '@/components/Badges';
import { labelOf } from '@/lib/services';
import { DAYS, dayNum, fmtDate, fmtDay, fromDayNum, ilParts, todayIL, weekday } from '@/lib/dates';
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

export function DoctorAgendaView({ rows, past, isAdmin, name, now = new Date(), intake = {}, openRequests = 0, approvals, reschedules = [], setup, share, calendar, mode = past ? 'past' : 'list' }: {
  rows: ApptRow[]; past: boolean;
  /** the visual calendar (day / week / month), shown in the main card */
  calendar?: React.ReactNode;
  mode?: 'day' | 'week' | 'month' | 'list' | 'past'; isAdmin: boolean; name: string; now?: Date; intake?: Record<string, IntakeChip>; openRequests?: number;
  approvals?: (id: string) => React.ReactNode;
  reschedules?: React.ReactNode[];
  setup?: React.ReactNode;
  share?: React.ReactNode;
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
  const mins = next ? Math.round((new Date(next.starts_at).getTime() - now.getTime()) / 60000) : 0;
  const until = !next || !np ? '' : np.date === today
    ? (mins < 60 ? `בעוד ${Math.max(1, mins)} דקות` : `בעוד ${Math.floor(mins / 60)} שע׳${mins % 60 >= 10 ? ` ו־${mins % 60} דק׳` : ''}`)
    : day(next) === 1 ? 'מחר' : `בעוד ${day(next)} ימים`;
  const asks = pending.length + reschedules.length;
  const load = Array.from({ length: 14 }, (_, i) => active.filter((r) => day(r) === i).length);
  const peak = Math.max(1, ...load);
  const metrics: { k: string; v: number; l: string; href: string; tone?: string }[] = [
    { k: 'today', v: todays.length, l: 'תורים היום', href: '/doctor?view=day#cal' },
    { k: 'week', v: week.length, l: 'השבוע', href: '/doctor?view=week#cal' },
    { k: 'asks', v: asks, l: 'לאישורך', href: '#approvals', tone: asks ? 'warn' : '' },
    { k: 'wait', v: waiting.length, l: 'ממתינים למכתב', href: '#waiting', tone: waiting.length ? 'hot' : '' },
  ];
  return (
    <div className="dx">
      <section className="dx-hero">
        <div className="dx-hero-main">
          <span className="dx-date"><Icon name="calendar" size={14} />יום {DAYS[weekday(today)]} · {fmtDate(today)}</span>
          <h1>{greeting(now)}, {name}</h1>
          <p>
            {todays.length ? `היום ${todays.length === 1 ? 'תור אחד' : `${todays.length} תורים`} ביומן` : 'היום היומן פנוי'}
            {asks ? ` · ${asks === 1 ? 'בקשה אחת מחכה' : `${asks} בקשות מחכות`} לאישורך` : ' · אין בקשות פתוחות'}
          </p>
          <div className="dx-metrics">
            {metrics.map((m) => (
              <Link key={m.k} href={m.href} className={`dx-m ${m.tone || ''}`}>
                <b className="num">{m.v}</b><span>{m.l}</span>
              </Link>
            ))}
          </div>
          <div className="dx-actions">
            <Link href="/doctor/book" className="dx-cta"><Icon name="calendarPlus" size={18} />קביעת תור חדש</Link>
            {share && <div className="dx-share">{share}</div>}
          </div>
        </div>
        {next && np ? (
          <Link href={`/doctor/cases/${next.id}`} className="dx-next">
            <span className="dx-next-k"><span className="dx-pulse" />התור הבא · {until}</span>
            <span className="dx-next-t num">{np.time}</span>
            <b>{next.patient_name || 'ממתין לפרטים'}</b>
            <span className="dx-next-s">{fmtDay(np.date)} · {labelOf(next)}{next.mode === 'phone' ? ' · טלפוני' : ''}</span>
            <span className="dx-next-f"><AiChip i={intake[next.id]} /><span className="dx-go">לתיק<Icon name="chevron" size={15} /></span></span>
          </Link>
        ) : (
          <div className="dx-next dx-next-empty">
            <span className="dx-next-k">התור הבא</span>
            <b>אין תורים קרובים</b>
            <span className="dx-next-s">שלחו את קישור קביעת התור למפנים, והבקשות יגיעו לכאן.</span>
          </div>
        )}
      </section>

      {setup}

      {asks > 0 && (
        <section className="dx-card dx-asks" id="approvals">
          <div className="dx-h"><span className="dx-ic warn"><Icon name="inbox" size={18} /></span><h2>מחכה לאישורך</h2><span className="dx-count">{asks}</span></div>
          {pending.length > 0 && (
            <div className="req-list">
              {pending.map((r) => {
                const p = ilParts(r.starts_at);
                return (
                  <div className="req" key={r.id}>
                    <Link href={`/doctor/cases/${r.id}`} className="req-main">
                      <span className="req-when"><b className="num">{p.time}</b><small>{fmtDay(p.date)}</small></span>
                      <span className="item-main">
                        <b>{r.patient_name || 'ממתין לפרטים'}</b>
                        <span className="item-meta"><span>{labelOf(r)}</span><span>·</span><span>{r.firm_name}</span></span>
                        {new Date(r.starts_at) < now ? <span className="badge b-cancelled">המועד עבר · כדאי לדחות ולבקש מועד חדש</span> : <AiChip i={intake[r.id]} />}
                      </span>
                    </Link>
                    <div className="req-actions">{approvals?.(r.id)}</div>
                  </div>
                );
              })}
            </div>
          )}
          {reschedules.length > 0 && <div className="stack-sm dx-resched"><span className="hint">בקשות לשינוי מועד</span>{reschedules}</div>}
        </section>
      )}

      <div className="dx-grid">
        <section className="dx-card flush dx-cal" id="cal">
          <div className="dx-h">
            <span className="dx-ic"><Icon name="calendar" size={18} /></span>
            <h2>{mode === 'past' ? 'ביקורים קודמים' : 'היומן'}</h2>
            <nav className="dx-seg" aria-label="תצוגת היומן">
              {([['day', 'יום'], ['week', 'שבוע'], ['month', 'חודש'], ['list', 'רשימה'], ['past', 'עבר']] as const).map(([v, l]) => (
                <Link key={v} href={`/doctor?view=${v}#cal`} aria-current={mode === v}>{l}</Link>
              ))}
            </nav>
            <Link href="/doctor/book" className="btn btn-sm btn-primary dx-new"><Icon name="calendarPlus" size={15} />תור חדש</Link>
          </div>
          {calendar && mode !== 'list' && mode !== 'past' ? <div className="dx-calbody">{calendar}</div>
            : list.length === 0 ? <Empty icon="calendar">{past ? 'אין ביקורים קודמים.' : 'אין תורים קרובים. כשמפנה יקבע תור, הוא יופיע כאן.'}</Empty> : (
            <div className="list dx-list">
              {groupByDay(list.slice(0, 60)).map((g) => (
                <div key={g.date}>
                  <div className="list-day">{g.date === today ? 'היום' : fmtDay(g.date)} <span>{fmtDate(g.date)} · {g.rows.length === 1 ? 'תור אחד' : `${g.rows.length} תורים`}</span></div>
                  {g.rows.map((r) => <ApptItem key={r.id} r={r} href={`/doctor/cases/${r.id}`} staff extra={<AiChip i={intake[r.id]} />} />)}
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="dx-side">
          <section className="dx-card flush" id="waiting">
            <div className="dx-h"><span className={`dx-ic ${waiting.length ? 'hot' : 'ok'}`}><Icon name="file" size={18} /></span><h2>ממתינים למכתב</h2><span className="dx-count">{waiting.length}</span></div>
            {waiting.length === 0 ? <div className="dx-zero"><Icon name="checkCircle" size={20} />הכול כתוב. אין ביקורים שממתינים למכתב.</div> : (
              <div className="dx-wait">
                {waiting.slice(0, 8).map((r) => {
                  const d = -day(r);
                  return (
                    <Link key={r.id} href={`/doctor/cases/${r.id}`}>
                      <span className="fc-av">{(r.patient_name || '?').trim().slice(0, 1)}</span>
                      <span className="dx-wait-m"><b>{r.patient_name || 'ממתין לפרטים'}</b><small>{labelOf(r)}</small></span>
                      <span className={`dx-age ${d > 7 ? 'old' : ''}`}>{d <= 0 ? 'היום' : d === 1 ? 'אתמול' : `לפני ${d} ימים`}</span>
                    </Link>
                  );
                })}
                {waiting.length > 8 && <span className="hint dx-wait-more">ועוד {waiting.length - 8}</span>}
              </div>
            )}
            {openRequests > 0 && <div className="dx-note"><Icon name="mail" size={15} />{openRequests === 1 ? 'בקשת מסמכים אחת פתוחה' : `${openRequests} בקשות מסמכים פתוחות`}</div>}
          </section>

          <section className="dx-card">
            <div className="dx-h"><span className="dx-ic"><Icon name="chart" size={18} /></span><h2>השבועיים הקרובים</h2><span className="dx-count">{load.reduce((a, b) => a + b, 0)}</span></div>
            <div className="dx-bars" role="img" aria-label="מספר התורים בכל יום בשבועיים הקרובים">
              {load.map((v, i) => {
                const d = fromDayNum(dayNum(today) + i);
                return (
                  <span key={i} className={`dx-bar${i === 0 ? ' now' : ''}${weekday(d) === 6 ? ' off' : ''}`} title={`${i === 0 ? 'היום' : fmtDay(d)}: ${v}`}>
                    <i style={{ height: `${v ? Math.max(10, (v / peak) * 100) : 4}%` }}>{v > 0 && <em className="num">{v}</em>}</i>
                    <small>{'אבגדהוש'[weekday(d)]}</small>
                  </span>
                );
              })}
            </div>
            <div className="dx-links">
              <Link href="/doctor?view=month#cal"><Icon name="calendar" size={15} />חודש</Link>
              <Link href="/doctor/payments"><Icon name="wallet" size={15} />אישור תשלומים</Link>
              {isAdmin && outstanding > 0 && <Link href="/admin/reports?tab=collect"><Icon name="wallet" size={15} />גבייה</Link>}
            </div>
          </section>
        </aside>
      </div>
    </div>
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
            <span className="item-main"><b>{labelOf(r)}</b><span className="item-meta">{r.firm_name}</span></span>
            <StatusBadge status={r.status} staff />
          </Link>
        ))}
      </div>
    </section>
  );
}

export function DoctorCaseView({ c, notes, docs, payment, letter, cancel, intake, comms, approval, resolve, history, reschedule, rx }: {
  c: CaseDetail; notes: NoteRow[]; docs: DocRow[]; payment?: React.ReactNode; letter: React.ReactNode; cancel?: React.ReactNode;
  intake?: React.ReactNode; comms?: React.ReactNode; approval?: React.ReactNode; resolve?: (n: NoteRow) => React.ReactNode;
  history?: React.ReactNode; reschedule?: React.ReactNode; rx?: React.ReactNode;
}) {
  const openReq = notes.filter((n) => n.kind === 'request' && !n.resolved_at).length;
  return (
    <>
      <PageHead title="" crumbs={[{ href: '/doctor', label: 'יומן ותיקים' }]} />
      <CaseHero c={c} staff actions={cancel} referrer={
        <>
          <span className="ch-label">מפנה</span>
          <KindBadge kind={c.firm.kind} />
          <b>{c.firm.name}</b>
          {[c.firm.contact_name, c.firm.phone].filter(Boolean).map((x) => <span key={x} className="ch-sep">{x}</span>)}
        </>
      } />
      {!c.details_at && c.status !== 'cancelled' && (
        <div className="callout warn"><div><Icon name="clock" />המפנה קבע את התור ועוד לא העלה מסמכים ופרטי מטופל. ברגע שישלים, תקבלו התראה, סיכום של התיק וטיוטת מכתב.</div></div>
      )}
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
          { key: 'rx', label: 'אבחנות ומרשם', icon: 'pill', content: rx },
          { key: 'send', label: comms && payment ? 'שליחה ותשלום' : 'זימונים ושליחה', icon: 'send', content: (
            <div className="cols case-cols">
              <div className="stack">{comms}</div>
              <div className="stack">{payment}</div>
            </div>
          ) },
        ].filter((t) => (t.key !== 'send' || comms || payment) && (t.key !== 'rx' || rx))}
      />
    </>
  );
}

export function payerName(c: CaseDetail) {
  return c.payer === 'patient' ? `${c.patient_name} (המטופל)` : c.firm.name;
}

