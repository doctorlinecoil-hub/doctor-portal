import Link from 'next/link';
import Icon from '@/components/Icon';
import { PageHead } from '@/components/ui';
import { STATUS_STAFF, type Settings } from '@/lib/constants';
import { labelOf } from '@/lib/services';
import { DAYS, dayNum, fmtDate, fromDayNum, hm2min, ilParts, ilToUtc, min2hm, todayIL, weekday } from '@/lib/dates';
import type { ApptRow } from '@/lib/types';

export type BlockRow = { id: string; starts_at: string; ends_at: string; note: string };

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/** Sunday of the week that contains `date`. */
export const weekStart = (date: string) => fromDayNum(dayNum(date) - weekday(date));
export function monthGridStart(date: string) {
  const first = date.slice(0, 8) + '01';
  return weekStart(first);
}

function minutesOf(iso: string) {
  const p = ilParts(iso);
  return { date: p.date, min: hm2min(p.time) };
}

export function CalendarView({ view, date, rows, blocks, settings, tools, slotAction, blockAction, now = new Date(), base = '/doctor/calendar', embedded }: {
  view: 'day' | 'week' | 'month'; date: string; rows: ApptRow[]; blocks: BlockRow[]; settings: Settings; now?: Date;
  /** the page the calendar lives on (links keep to it) */
  base?: string;
  /** inside the dashboard: no page title and no view tabs (the card has them) */
  embedded?: boolean;
  tools?: React.ReactNode;
  /** the button on a free slot (book / block) */
  slotAction?: (iso: string, label: string) => React.ReactNode;
  /** the control on a blocked period (remove) */
  blockAction?: (b: BlockRow) => React.ReactNode;
}) {
  const today = todayIL();
  const active = rows.filter((r) => r.status !== 'cancelled');
  const step = view === 'week' ? 7 : 35;
  const start = view === 'day' ? date : view === 'week' ? weekStart(date) : monthGridStart(date);
  const [yy, mm] = date.split('-').map(Number);
  const monthOf = (y: number, m: number) => (m < 1 ? `${y - 1}-12-01` : m > 12 ? `${y + 1}-01-01` : `${y}-${String(m).padStart(2, '0')}-01`);
  const prev = view === 'day' ? fromDayNum(dayNum(date) - 1) : view === 'week' ? fromDayNum(dayNum(date) - 7) : monthOf(yy, mm - 1);
  const next = view === 'day' ? fromDayNum(dayNum(date) + 1) : view === 'week' ? fromDayNum(dayNum(date) + 7) : monthOf(yy, mm + 1);
  const dayCount = active.filter((r) => ilParts(r.starts_at).date === date).length;
  const title = view === 'day'
    ? `יום ${DAYS[weekday(date)]} · ${fmtDate(date)}`
    : view === 'week'
    ? `${fmtDate(start)} – ${fmtDate(fromDayNum(dayNum(start) + 6))}`
    : `${MONTHS[+date.slice(5, 7) - 1]} ${date.slice(0, 4)}`;
  const href = (v: string, d: string) => `${base}?view=${v}&d=${d}${embedded ? '#cal' : ''}`;
  const dayHref = (d: string) => href('day', d);

  return (
    <>
      {!embedded && (
        <PageHead title="יומן" sub="כל התורים והשעות החסומות. לחיצה על משבצת פנויה: קביעת תור או חסימה.">
          <Link href="/doctor/book" className="btn btn-primary"><Icon name="calendarPlus" />תור חדש</Link>
        </PageHead>
      )}
      <div className="cal-bar">
        <div className="row" style={{ gap: 6 }}>
          <Link className="btn btn-sm" href={href(view, prev)} aria-label="הקודם"><Icon name="chevron" className="flip" /></Link>
          <Link className="btn btn-sm" href={href(view, today)}>היום</Link>
          <Link className="btn btn-sm" href={href(view, next)} aria-label="הבא"><Icon name="chevron" /></Link>
          <h2 className="cal-title">{title}</h2>
        </div>
        {embedded ? tools : (
          <nav className="tabs" aria-label="תצוגה">
            <Link href={href('day', date)} aria-current={view === 'day'}>יום</Link>
            <Link href={href('week', date)} aria-current={view === 'week'}>שבוע</Link>
            <Link href={href('month', date)} aria-current={view === 'month'}>חודש</Link>
          </nav>
        )}
      </div>
      {!embedded && tools}
      {view === 'day' && <p className="hint">{dayCount ? `${dayCount === 1 ? 'תור אחד' : `${dayCount} תורים`} ביום הזה` : 'אין תורים ביום הזה'}</p>}
      {view !== 'month' ? (
        <WeekGrid dayHref={dayHref} start={start} single={view === 'day'} rows={active} blocks={blocks} settings={settings} today={today} now={now} slotAction={slotAction} blockAction={blockAction} />
      ) : (
        <MonthGrid dayHref={dayHref} start={start} month={date.slice(0, 7)} rows={active} blocks={blocks} settings={settings} today={today} days={step} />
      )}
      <div className="cal-legend hint">
        <span><i className="lg pending" />ממתין לאישור</span><span><i className="lg booked" />מאושר</span><span><i className="lg draft" />מכתב בטיוטה</span>
        <span><i className="lg done" />הסתיים</span><span><i className="lg block" />חסום</span>
      </div>
    </>
  );
}

function WeekGrid({ dayHref, start, single, rows, blocks, settings, today, now, slotAction, blockAction }: {
  dayHref: (d: string) => string; start: string; single?: boolean; rows: ApptRow[]; blocks: BlockRow[]; settings: Settings; today: string; now: Date;
  slotAction?: (iso: string, label: string) => React.ReactNode; blockAction?: (b: BlockRow) => React.ReactNode;
}) {
  const days = Array.from({ length: single ? 1 : 7 }, (_, i) => fromDayNum(dayNum(start) + i));
  const shown = single ? days : days.filter((d) => settings.weekly[String(weekday(d))]?.on || rows.some((r) => ilParts(r.starts_at).date === d));
  const step = Math.max(10, settings.slot_minutes || 30);
  const on = Object.values(settings.weekly).filter((w) => w.on);
  const from = Math.min(...on.map((w) => hm2min(w.from)), ...rows.map((r) => minutesOf(r.starts_at).min), 8 * 60);
  const to = Math.max(...on.map((w) => hm2min(w.to)), ...rows.map((r) => minutesOf(r.ends_at ?? r.starts_at).min), from + 4 * 60);
  const top = Math.floor(from / 60) * 60;
  const bottom = Math.ceil(to / 60) * 60;
  // pixels per minute: short slots get more room, so each one is easy to click
  const PX = step <= 15 ? 2.2 : step <= 20 ? 1.8 : 1.4;
  const hours = Array.from({ length: (bottom - top) / 60 }, (_, i) => top + i * 60);
  const nowP = ilParts(now);
  const nowMin = hm2min(nowP.time);

  return (
    <div className="cal-week" style={{ ['--cols' as string]: shown.length }}>
      <div className="cal-head">
        <span />
        {shown.map((d) => (
          <Link key={d} href={dayHref(d)} className={`cal-dh${d === today ? ' today' : ''}`}>
            <small>{DAYS[weekday(d)]}</small><b className="num">{+d.slice(8, 10)}.{+d.slice(5, 7)}</b>
          </Link>
        ))}
      </div>
      <div className="cal-body" style={{ height: (bottom - top) * PX }}>
        <div className="cal-hours">
          {hours.map((h) => <span key={h} style={{ top: (h - top) * PX }} className="num">{min2hm(h)}</span>)}
        </div>
        {shown.map((d) => {
          const cfg = settings.weekly[String(weekday(d))];
          const closed = !cfg?.on || settings.blocked_dates.includes(d);
          const dayRows = rows.filter((r) => ilParts(r.starts_at).date === d);
          const dayBlocks = blocks.filter((b) => minutesOf(b.starts_at).date <= d && minutesOf(b.ends_at).date >= d);
          const slots: { min: number; iso: string }[] = [];
          if (!closed) {
            for (let t = hm2min(cfg.from); t + step <= hm2min(cfg.to); t += step) {
              const iso = ilToUtc(d, min2hm(t)).toISOString();
              const end = new Date(iso).getTime() + step * 60000;
              const taken = dayRows.some((r) => new Date(r.starts_at).getTime() < end && new Date(r.ends_at ?? r.starts_at).getTime() > new Date(iso).getTime())
                || dayBlocks.some((b) => new Date(b.starts_at).getTime() < end && new Date(b.ends_at).getTime() > new Date(iso).getTime());
              if (!taken && new Date(iso) > now) slots.push({ min: t, iso });
            }
          }
          return (
            <div key={d} className={`cal-col${closed ? ' closed' : ''}${d === today ? ' today' : ''}`}>
              {hours.map((h) => <i key={h} className="cal-line" style={{ top: (h - top) * PX }} />)}
              {closed && <span className="cal-closed">{settings.blocked_dates.includes(d) ? 'יום חסום' : 'סגור'}</span>}
              {slots.map((s) => (
                <div key={s.iso} className="cal-free" style={{ top: (s.min - top) * PX, height: step * PX - 2 }}>
                  {slotAction?.(s.iso, `${DAYS[weekday(d)]} ${fmtDate(d)} ${min2hm(s.min)}`)}
                </div>
              ))}
              {dayBlocks.map((b) => {
                const s = minutesOf(b.starts_at);
                const e = minutesOf(b.ends_at);
                const a = s.date < d ? top : s.min;
                const z = e.date > d ? bottom : e.min;
                return (
                  <div key={b.id + d} className="cal-block" style={{ top: (Math.max(a, top) - top) * PX, height: Math.max(18, (Math.min(z, bottom) - Math.max(a, top)) * PX - 2) }}>
                    <span><Icon name="x" size={12} />{b.note || 'חסום'}</span>
                    {blockAction?.(b)}
                  </div>
                );
              })}
              {dayRows.map((r) => {
                const s = minutesOf(r.starts_at);
                const len = Math.max(step, (new Date(r.ends_at ?? r.starts_at).getTime() - new Date(r.starts_at).getTime()) / 60000 || step);
                return (
                  <Link key={r.id} href={`/doctor/cases/${r.id}`} className={`cal-ev ${r.status}${r.mode === 'phone' ? ' phone' : ''}`} style={{ top: (s.min - top) * PX, height: len * PX - 2 }}
                    title={`${r.patient_name} · ${labelOf(r)} · ${STATUS_STAFF[r.status]}`}>
                    <b>{r.mode === 'phone' && <Icon name="phone" size={12} />}{r.patient_name || 'ממתין לפרטים'}</b>
                    <span className="num">{ilParts(r.starts_at).time} · {labelOf(r)}{r.mode === 'phone' ? ' · טלפוני' : ''}{single && r.firm_name ? ` · ${r.firm_name}` : ''}</span>
                  </Link>
                );
              })}
              {d === nowP.date && nowMin >= top && nowMin <= bottom && <i className="cal-now" style={{ top: (nowMin - top) * PX }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthGrid({ dayHref, start, month, rows, blocks, settings, today, days }: {
  dayHref: (d: string) => string; start: string; month: string; rows: ApptRow[]; blocks: BlockRow[]; settings: Settings; today: string; days: number;
}) {
  const cells = Array.from({ length: days + 7 }, (_, i) => fromDayNum(dayNum(start) + i)).slice(0, 42);
  const lastRow = cells.findIndex((d, i) => i % 7 === 0 && d.slice(0, 7) > month);
  const list = lastRow > 0 ? cells.slice(0, lastRow) : cells;
  const inMonth = rows.filter((r) => ilParts(r.starts_at).date.slice(0, 7) === month).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const agenda = [...new Set(inMonth.map((r) => ilParts(r.starts_at).date))].map((d) => ({ d, rows: inMonth.filter((r) => ilParts(r.starts_at).date === d) }));
  return (
    <>
    <div className="cal-month">
      {DAYS.map((d) => <div key={d} className="cal-mh">{d}</div>)}
      {list.map((d) => {
        const dayRows = rows.filter((r) => ilParts(r.starts_at).date === d).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
        const cfg = settings.weekly[String(weekday(d))];
        const blocked = settings.blocked_dates.includes(d) || blocks.some((b) => minutesOf(b.starts_at).date <= d && minutesOf(b.ends_at).date >= d);
        const pend = dayRows.filter((r) => r.status === 'pending').length;
        return (
          <Link key={d} href={dayHref(d)} title={dayRows.map((r) => `${ilParts(r.starts_at).time} ${r.patient_name || 'ממתין לפרטים'}`).join('\n') || undefined}
            className={`cal-day${d.slice(0, 7) !== month ? ' out' : ''}${d === today ? ' today' : ''}${!cfg?.on ? ' closed' : ''}${blocked ? ' blocked' : ''}`}>
            <span className="cal-dh2"><span className="cal-dn num">{+d.slice(8, 10)}</span>{dayRows.length > 0 && <span className="cal-cnt num">{dayRows.length}</span>}</span>
            {dayRows.slice(0, 4).map((r) => (
              <span key={r.id} className={`cal-chip ${r.status}`}>
                <span className="num">{ilParts(r.starts_at).time}</span><b>{r.patient_name || 'ממתין לפרטים'}</b>
              </span>
            ))}
            {dayRows.length > 4 && <span className="cal-more">+{dayRows.length - 4} נוספים</span>}
            {dayRows.length > 0 && <span className="cal-dots" aria-hidden>{dayRows.slice(0, 5).map((r) => <i key={r.id} className={r.status} />)}</span>}
            {pend > 0 && <span className="cal-pend">{pend} לאישור</span>}
          </Link>
        );
      })}
    </div>
    <section className="cal-agenda" aria-label="המטופלים שנקבעו החודש">
      <h3>המטופלים שנקבעו ב{MONTHS[+month.slice(5, 7) - 1]} <span className="num">{inMonth.length}</span></h3>
      {agenda.length === 0 ? <p className="muted">אין תורים החודש.</p> : agenda.map((g) => (
        <div key={g.d} className={`cal-ag-day${g.d === today ? ' today' : ''}`}>
          <div className="cal-ag-h"><b>{g.d === today ? 'היום' : `יום ${DAYS[weekday(g.d)]}`}</b><span className="num">{fmtDate(g.d)}</span></div>
          {g.rows.map((r) => (
            <Link key={r.id} href={`/doctor/cases/${r.id}`} className={`cal-ag-row ${r.status}`}>
              <span className="cal-ag-t num">{ilParts(r.starts_at).time}</span>
              <span className="cal-ag-m"><b>{r.patient_name || 'ממתין לפרטים'}</b><small>{labelOf(r)}{r.mode === 'phone' ? ' · טלפוני' : ''}</small></span>
              <span className={`cal-ag-s ${r.status}`}>{STATUS_STAFF[r.status]}</span>
            </Link>
          ))}
        </div>
      ))}
    </section>
    </>
  );
}
