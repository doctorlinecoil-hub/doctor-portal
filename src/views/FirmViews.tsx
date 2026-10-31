import Link from 'next/link';
import Icon from '@/components/Icon';
import { PageHead, Stat, Empty } from '@/components/ui';
import { PayBadge, StatusBadge, TypeBadge } from '@/components/Badges';
import { PAYERS, PAY_METHODS, ils, payState } from '@/lib/constants';
import { labelOf } from '@/lib/services';
import FirmCasesBrowser from '@/components/FirmCasesBrowser';
import { age, fmtDate, fmtDay, fmtStamp, ilParts, todayIL } from '@/lib/dates';
import { released, type ApptRow, type CaseDetail, type DocRow, type NoteRow, type PaymentRow } from '@/lib/types';

function owes(r: ApptRow) {
  return r.status !== 'cancelled' && r.payer === 'referrer' ? Math.max(0, r.price - r.paid) : 0;
}

export function ApptItem({ r, href, staff, extra }: { r: ApptRow; href: string; staff?: boolean; extra?: React.ReactNode }) {
  const p = ilParts(r.starts_at);
  const waiting = !r.patient_name && r.status !== 'cancelled';
  return (
    <Link href={waiting && !staff ? `${href}/details` : href} className="item">
      <span className="item-time">{p.time}<small>{fmtDay(p.date).split(',')[0]}</small></span>
      <span className="item-main">
        <b>{r.patient_name || 'ממתין לפרטי המטופל'}{r.mode === 'phone' && <span className="mode-chip" style={{ marginInlineStart: 8 }}><Icon name="phone" size={12} />טלפוני</span>}</b>
        {waiting && <span className="wait-chip"><Icon name="upload" size={13} />{staff ? 'המפנה עוד לא העלה מסמכים ופרטים' : 'להשלמה: מסמכים ופרטים'}</span>}
        <span className="item-meta">
          <span>{labelOf(r)}</span>
          <span>·</span>
          <span className="num">תיק {r.case_no}</span>
          {r.firm_name && <><span>·</span><span>{r.firm_name}</span></>}
        </span>
        {extra}
      </span>
      <span className="item-side"><StatusBadge status={r.status} staff={staff} /></span>
    </Link>
  );
}

export function FirmDashboardView({ firmName, clinicName, rows, gate = true, free = [] }: { firmName: string; clinicName: string; rows: ApptRow[]; gate?: boolean; free?: { date: string; times: { time: string; iso: string }[] }[] }) {
  const today = todayIL();
  const now = new Date().toISOString();
  const live = rows.filter((r) => r.status !== 'cancelled');
  // real appointments still ahead (a document without a calendar slot is not an appointment)
  const upcoming = live.filter((r) => !r.walk_in && r.starts_at >= now && r.status !== 'done').sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const pending = rows.filter((r) => r.status === 'pending').sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const active = rows.filter((r) => r.status === 'booked' || r.status === 'draft');
  const ready = rows.filter((r) => r.status === 'done').sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const todo = live.filter((r) => !r.patient_name && r.starts_at >= now).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const patients = new Set(live.map((r) => (r.patient_id_number || r.patient_name || r.id).replace(/\s/g, ''))).size;
  const next = upcoming.find((r) => r.starts_at >= now && r.status !== 'pending');
  const np = next ? ilParts(next.starts_at) : null;
  const hour = Number(ilParts(now).time.slice(0, 2));
  const hello = hour < 12 ? 'בוקר טוב' : hour < 18 ? 'צהריים טובים' : 'ערב טוב';
  const soon = upcoming.filter((r) => r.status !== 'pending').slice(0, 6);
  const metrics: { href: string; v: number; l: string; tone?: string }[] = [
    { href: '/firm/cases?f=pending', v: pending.length, l: 'ממתינים לאישור', tone: pending.length ? 'warn' : '' },
    { href: '/firm/cases?f=upcoming', v: upcoming.length, l: 'תורים קרובים' },
    { href: '/firm/cases?f=open', v: active.length + pending.length, l: 'תיקים בטיפול' },
    { href: '/firm/cases?f=done', v: ready.length, l: 'מסמכים מוכנים', tone: ready.length ? 'ok' : '' },
  ];
  const Row = ({ r }: { r: ApptRow }) => {
    const p = ilParts(r.starts_at);
    return (
      <Link href={!r.patient_name && r.status !== 'cancelled' ? `/firm/cases/${r.id}/details` : `/firm/cases?open=${r.id}`} className="fx-row">
        <span className="fx-when"><b className="num">{p.time}</b><small>{p.date === today ? 'היום' : fmtDate(p.date)}</small></span>
        <span className="fx-rm">
          <b>{r.patient_name || 'ממתין לפרטי המטופל'}</b>
          <small>{labelOf(r)}{r.mode === 'phone' ? ' · טלפוני' : ''} · <span className="num">תיק {r.case_no}</span></small>
        </span>
        <span className={`fx-st ${r.status}`}><i />{STATUS_FIRM_SHORT[r.status]}</span>
      </Link>
    );
  };
  return (
    <div className="fx">
      <section className="fx-hero">
        <div className="fx-hero-main">
          <span className="fx-hello">{hello}</span>
          <h1>{firmName}</h1>
          <p>כל המטופלים שהפניתם ל{clinicName} במקום אחד: תורים, סטטוס ומסמכים מוכנים.</p>
          <form className="fx-search" action="/firm/cases" role="search">
            <Icon name="search" size={18} />
            <input name="q" placeholder="חיפוש מטופל: שם, ת״ז או מספר תיק" aria-label="חיפוש מטופל" />
            <button className="btn btn-sm" type="submit">חיפוש</button>
          </form>
          <div className="fx-metrics">
            {metrics.map((m) => (
              <Link key={m.l} href={m.href} className={`fx-m ${m.tone || ''}`}><b className="num">{m.v}</b><span>{m.l}</span></Link>
            ))}
          </div>
        </div>
        <aside className="fx-side">
          <Link href="/firm/book" className="fx-new">
            <span className="fx-new-ic"><Icon name="calendarPlus" size={22} /></span>
            <span><b>זימון חדש</b><small>תור למטופל בשלושה צעדים</small></span>
            <Icon name="arrowLeft" size={18} />
          </Link>
          {next && np ? (
            <Link href={`/firm/cases?open=${next.id}`} className="fx-next">
              <span className="fx-next-k"><span className="dx-pulse" />התור הבא</span>
              <span className="fx-next-t num">{np.time}</span>
              <b>{next.patient_name || 'ממתין לפרטים'}</b>
              <small>{np.date === today ? 'היום' : fmtDay(np.date)} · {labelOf(next)}</small>
            </Link>
          ) : (
            <div className="fx-next empty"><span className="fx-next-k">התור הבא</span><b>אין תורים קרובים</b><small>קובעים תור חדש בלחיצה למעלה.</small></div>
          )}
        </aside>
      </section>

      <section className="fx-quick" aria-label="תורים פנויים">
        <div className="fx-quick-h">
          <span className="fx-ic gold"><Icon name="calendarPlus" size={18} /></span>
          <div><h2>קביעת תור מהירה</h2><small>בוחרים שעה פנויה, ממלאים את המטופל, וזהו.</small></div>
          <Link href="/firm/book" className="fx-all">כל המועדים<Icon name="chevron" size={14} className="flip" /></Link>
        </div>
        {free.length === 0 ? <div className="fx-zero"><Icon name="calendar" size={22} />אין כרגע מועדים פנויים בשבועות הקרובים. אפשר ליצור קשר עם המרפאה.</div> : (
          <div className="fx-days">
            {free.map((d) => (
              <div key={d.date} className="fx-day">
                <b>{d.date === today ? 'היום' : fmtDay(d.date).split(',')[0]}<small className="num">{fmtDate(d.date)}</small></b>
                <div className="fx-times">
                  {d.times.map((t) => <Link key={t.iso} href={`/firm/book?slot=${encodeURIComponent(t.iso)}`} className="fx-time num">{t.time}</Link>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {todo.length > 0 && (
        <section className="fx-todo">
          <span className="fx-todo-ic"><Icon name="upload" size={18} /></span>
          <div><b>{todo.length === 1 ? 'תיק אחד מחכה לפרטים ומסמכים' : `${todo.length} תיקים מחכים לפרטים ומסמכים`}</b><small>כדי שהרופא יתכונן לביקור, השלימו את פרטי המטופל והעלו את המסמכים.</small></div>
          <Link href={`/firm/cases/${todo[0].id}/details`} className="btn btn-sm btn-primary">להשלמה<Icon name="arrowLeft" size={15} /></Link>
        </section>
      )}

      <div className="fx-grid">
        <section className="fx-card">
          <div className="fx-h"><span className="fx-ic ok"><Icon name="fileCheck" size={18} /></span><h2>מסמכים מוכנים</h2><Link href="/firm/cases?f=done" className="fx-all">הכל<Icon name="chevron" size={14} className="flip" /></Link></div>
          {ready.length === 0 ? <div className="fx-zero"><Icon name="file" size={22} />כשהרופא יסיים מסמך, הוא יופיע כאן להורדה.</div> : (
            <ul className="fx-docs">
              {ready.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <span className="fx-pdf">PDF</span>
                  <Link href={`/firm/cases?open=${r.id}`} className="fx-rm"><b>{r.patient_name || 'מטופל'}</b><small className="num">{labelOf(r)} · {fmtDate(ilParts(r.starts_at).date)}{released(r, gate) ? <> · <span className="fx-okpay">{r.paid > 0 ? 'שולם' : 'אושר ע״י הרופא'}</span></> : null}</small></Link>
                  {released(r, gate)
                    ? <a className="fx-dl" href={`/letters/${r.id}/pdf`} download aria-label={`הורדת המסמך של ${r.patient_name}`}><Icon name="download" size={16} /><span>הורדה</span></a>
                    : <span className="fx-wait">ממתין לתשלום</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="fx-card">
          <div className="fx-h"><span className="fx-ic"><Icon name="calendar" size={18} /></span><h2>התורים הקרובים</h2><Link href="/firm/cases?f=upcoming" className="fx-all">הכל<Icon name="chevron" size={14} className="flip" /></Link></div>
          {pending.length > 0 && (
            <div className="fx-pend">
              <span className="fx-sub">ממתינים לאישור הרופא</span>
              {pending.slice(0, 3).map((r) => <Row key={r.id} r={r} />)}
            </div>
          )}
          {soon.length === 0 ? <div className="fx-zero"><Icon name="calendar" size={22} />אין תורים מאושרים קרובים. <Link href="/firm/book">לזימון חדש</Link></div> : (
            <div className="fx-list">{soon.map((r) => <Row key={r.id} r={r} />)}</div>
          )}
        </section>
      </div>
      <p className="fx-foot"><Icon name="users" size={14} />{patients === 1 ? 'מטופל אחד' : `${patients} מטופלים`} הופנו עד היום</p>
    </div>
  );
}

const STATUS_FIRM_SHORT: Record<ApptRow['status'], string> = { pending: 'ממתין לאישור', booked: 'מאושר', draft: 'בטיפול', done: 'מוכן', cancelled: 'בוטל' };

export function groupByDay(rows: ApptRow[]) {
  const out: { date: string; rows: ApptRow[] }[] = [];
  for (const r of rows) {
    const d = ilParts(r.starts_at).date;
    const g = out[out.length - 1];
    if (g && g.date === d) g.rows.push(r);
    else out.push({ date: d, rows: [r] });
  }
  return out;
}

const FIRM_FILTERS = [
  { key: 'all', label: 'הכל' },
  { key: 'pending', label: 'ממתינים לאישור' },
  { key: 'upcoming', label: 'קרובים' },
  { key: 'open', label: 'בטיפול' },
  { key: 'done', label: 'מוכנים' },
  { key: 'cancelled', label: 'בוטלו' },
] as const;

export function filterFirmRows(rows: ApptRow[], f: string) {
  const today = todayIL();
  switch (f) {
    case 'upcoming': return rows.filter((r) => r.status !== 'cancelled' && r.status !== 'done' && !r.walk_in && ilParts(r.starts_at).date >= today).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    case 'pending': return rows.filter((r) => r.status === 'pending');
    case 'open': return rows.filter((r) => r.status === 'pending' || r.status === 'booked' || r.status === 'draft');
    case 'done': return rows.filter((r) => r.status === 'done');
    case 'cancelled': return rows.filter((r) => r.status === 'cancelled');
    default: return rows;
  }
}

/** Search by full name, ID number or case number (only the firm's own cases are ever loaded). */
export function searchFirmRows(rows: ApptRow[], q: string) {
  const t = q.trim().toLowerCase().replace(/\s+/g, ' ');
  if (t.length < 2) return rows;
  const digits = t.replace(/\D/g, '');
  return rows.filter((r) =>
    (r.patient_name || '').toLowerCase().replace(/\s+/g, ' ').includes(t) ||
    (digits.length >= 3 && (r.patient_id_number || '').replace(/\D/g, '').includes(digits)) ||
    (/^\d+$/.test(t) && String(r.case_no) === t));
}

export function FirmCasesView({ rows: all, filter, q = '', open, gate = true, clinicPhone = '' }: { rows: ApptRow[]; filter: string; q?: string; open?: string; gate?: boolean; clinicPhone?: string }) {
  const rows = searchFirmRows(all, q);
  const list = filterFirmRows(rows, filter);
  const qs = (f: string) => { const p = new URLSearchParams(); if (f !== 'all') p.set('f', f); if (q.trim()) p.set('q', q.trim()); const x = p.toString(); return x ? `/firm/cases?${x}` : '/firm/cases'; };
  return (
    <>
      <PageHead title="התיקים שלי" sub="כל המטופלים שהפניתם: תורים, סטטוס, והמסמכים של הרופא. לחיצה על שורה פותחת את התיק.">
        <Link href="/firm/book" className="btn btn-primary"><Icon name="calendarPlus" />זימון חדש</Link>
      </PageHead>
      <form className="search-big" action="/firm/cases" role="search" style={{ marginBottom: 14 }}>
        <Icon name="search" />
        <input name="q" defaultValue={q} placeholder="חיפוש לפי שם מלא, תעודת זהות או מספר תיק" aria-label="חיפוש מטופל" />
        {filter !== 'all' && <input type="hidden" name="f" value={filter} />}
        <button className="btn btn-primary" type="submit">חיפוש</button>
      </form>
      <nav className="tabs" aria-label="סינון">
        {FIRM_FILTERS.map((t) => (
          <Link key={t.key} href={qs(t.key)} aria-current={filter === t.key}>
            {t.label}<span className="count num">{filterFirmRows(rows, t.key).length}</span>
          </Link>
        ))}
      </nav>
      <section className="panel flush">
        {list.length === 0 ? <Empty>{q.trim().length >= 2 ? `לא נמצאו מטופלים עבור ״${q.trim()}״` : 'אין תיקים להצגה'}</Empty> : <FirmCasesBrowser rows={list} all={all} initial={open} gate={gate} clinicPhone={clinicPhone} />}
      </section>
    </>
  );
}

export function CaseHero({ c, staff, referrer, actions }: { c: CaseDetail; staff?: boolean; referrer?: React.ReactNode; actions?: React.ReactNode }) {
  const p = ilParts(c.starts_at);
  const a = age(c.patient_dob);
  return (
    <section className="case-hero">
      <div className="ch-main">
        <div className="case-avatar"><Icon name="user" /></div>
        <div className="ch-body">
          <div className="ch-top">
            <span className="case-no">תיק מס׳ {c.case_no}</span>
            <TypeBadge type={c.referral_type} label={c.service_label} />
            <StatusBadge status={c.status} staff={staff} />
            {c.walk_in && <span className="badge b-walkin">ללא תור ביומן</span>}
            {c.mode === 'phone' && <span className="mode-chip"><Icon name="phone" size={12} />שיחה טלפונית{staff && c.patient_phone ? ` · להתקשר ל־${c.patient_phone}` : ''}</span>}
          </div>
          <h1>{c.patient_name || 'ממתין לפרטי המטופל'}</h1>
          <div className="facts">
            <span className="fact"><Icon name="calendar" />{c.walk_in ? `ביקור: ${fmtDate(p.date)}` : `${fmtDay(p.date)} · ${p.time}`}</span>
            {c.patient_id_number && <span className="fact"><Icon name="idcard" /><span className="num">{c.patient_id_number}</span></span>}
            {a != null && <span className="fact"><Icon name="cake" />גיל {a}</span>}
            {c.patient_phone && <span className="fact"><Icon name="phone" /><span className="num ltr">{c.patient_phone}</span></span>}
            {c.patient_email && <span className="fact"><Icon name="mail" /><span className="ltr">{c.patient_email}</span></span>}
          </div>
        </div>
        {actions && <div className="ch-actions">{actions}</div>}
      </div>
      {referrer && <div className="ch-foot">{referrer}</div>}
    </section>
  );
}

export function NotesPanel({ notes, extra, resolve }: { notes: string; extra: NoteRow[]; resolve?: (n: NoteRow) => React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-head"><h2><Icon name="info" />בקשת המפנה והתכתבות</h2></div>
      <p className="note">{notes || <span className="muted">לא נכתבו הערות</span>}</p>
      {extra.map((n) => n.kind === 'request' ? (
        <div className={`note-item req${n.resolved_at ? ' resolved' : ''}`} key={n.id}>
          <div className="between"><span className="hint"><Icon name="flag" size={14} />בקשת המרפאה · {fmtStamp(n.created_at)}{n.resolved_at ? ' · טופל' : ''}</span>{!n.resolved_at && resolve?.(n)}</div>
          <p className="note">{n.body}</p>
        </div>
      ) : (
        <div className="note-item" key={n.id}><span className="hint">הערת המפנה · {fmtStamp(n.created_at)}</span><p className="note">{n.body}</p></div>
      ))}
    </section>
  );
}

/** Open requests from the clinic, shown on top of the referrer's case page. */
export function RequestsCallout({ notes }: { notes: NoteRow[] }) {
  const open = notes.filter((n) => n.kind === 'request' && !n.resolved_at);
  if (!open.length) return null;
  return (
    <section className="request-card">
      <div className="request-ic"><Icon name="flag" /></div>
      <div className="stack-sm" style={{ minWidth: 0 }}>
        <b>הרופא מבקש השלמות לתיק</b>
        {open.map((n) => <p key={n.id} className="note">{n.body}</p>)}
        <span className="hint">העלו את המסמכים בטופס ״הוספה לתיק״ למטה. הרופא יקבל הודעה.</span>
      </div>
    </section>
  );
}

export function DocsPanel({ docs, open }: { docs: DocRow[]; open?: boolean }) {
  return (
    <section className="panel">
      <div className="panel-head"><h2><Icon name="file" />מסמכים</h2><span className="hint">{docs.length} קבצים</span></div>
      {docs.length === 0 ? <p className="muted">לא צורפו מסמכים</p> : (
        <div>
          {docs.map((d) => {
            const img = d.mime_type.startsWith('image/');
            return (
              <div className="doc" key={d.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <span className={`file-ic${img ? ' img' : ''}`}>{img && d.url ? <img src={d.url} alt="" /> : img ? 'IMG' : 'PDF'}</span>
                <span><b>{d.file_name}</b><span className="hint">{(d.size_bytes / 1024 / 1024).toFixed(1)}MB · {fmtStamp(d.created_at)}</span></span>
                {open && d.url ? <a className="btn btn-sm" href={d.url} target="_blank" rel="noopener"><Icon name="externalLink" />פתיחה</a> : <span />}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function PaymentSummary({ price, paid, payer, payments, title = 'תשלום' }: { price: number; paid: number; payer: CaseDetail['payer']; payments: PaymentRow[]; title?: string }) {
  const state = payState(price, paid);
  const pct = price > 0 ? Math.min(100, Math.round((paid / price) * 100)) : 0;
  return (
    <section className="panel" id="payment">
      <div className="panel-head"><h2><Icon name="wallet" />{title}</h2><PayBadge state={state} /></div>
      <div className="pay-grid">
        <div><span>מחיר</span><b>{ils(price)}</b></div>
        <div><span>שולם</span><b>{ils(paid)}</b></div>
        <div><span>יתרה</span><b>{ils(Math.max(0, price - paid))}</b></div>
      </div>
      {price > 0 && <div className="pay-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>}
      <div className="hint">משלם: {PAYERS[payer]} · המחיר כולל מע״מ</div>
      {payments.length > 0 && (
        <div>
          {payments.map((p, i) => (
            <div className="pay-line" key={p.id ?? i}>
              <span><b className="money">{ils(p.amount)}</b> <span className="muted">· {PAY_METHODS[p.method]} · {fmtDate(p.paid_on)}</span></span>
              {p.receipt_url ? <a className="btn btn-sm" href={p.receipt_url} target="_blank" rel="noopener"><Icon name="receipt" />קבלה {p.receipt_no}</a>
                : p.receipt_no ? <span className="hint">קבלה {p.receipt_no}</span> : <span />}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function FirmCaseView({ c, notes, docs, payments, paid, letter, actions, forward, payBox }: {
  c: CaseDetail; notes: NoteRow[]; docs: DocRow[]; payments: PaymentRow[]; paid: number;
  letter: { ready: boolean; awaitingPayment: boolean; finalizedAt: string | null }; actions: React.ReactNode; forward?: React.ReactNode; payBox?: React.ReactNode;
}) {
  const incomplete = !c.details_at && c.status !== 'cancelled';
  return (
    <>
      <PageHead title="" crumbs={[{ href: '/firm/cases', label: 'התיקים שלי' }]} />
      <CaseHero c={c} />
      {incomplete && (
        <section className="complete-bar">
          <span className="complete-ic"><Icon name="upload" /></span>
          <div><b>התור נשמר. נשאר להעלות מסמכים ולאשר את פרטי המטופל</b><span>המערכת קוראת את הפרטים מהמסמכים וממלאת בשבילכם. הרופא מקבל את התיק רק אחרי השלב הזה.</span></div>
          <a className="btn btn-primary" href={`/firm/cases/${c.id}/details`}><Icon name="sparkles" />השלמת התיק</a>
        </section>
      )}
      {c.status === 'pending' && !incomplete && (
        <div className="callout warn"><div><Icon name="clock" />הבקשה ממתינה לאישור הרופא. מיד אחרי האישור יישלח זימון במייל{c.patient_email ? ' לכם ולמטופל' : ' אליכם'}.</div></div>
      )}
      {c.status === 'cancelled' && c.decline_reason && (
        <div className="callout bad"><div><Icon name="x" />הבקשה לא אושרה: {c.decline_reason}</div><a className="btn" href="/firm/book"><Icon name="calendarPlus" />בחירת מועד אחר</a></div>
      )}
      {payBox}
      <RequestsCallout notes={notes} />
      {letter.ready && (
        <div className="callout">
          <div><Icon name="checkCircle" />המכתב של הרופא מוכן{letter.finalizedAt ? ` · ${fmtStamp(letter.finalizedAt)}` : ''}</div>
          <div className="row" style={{ gap: 8 }}>
            <a className="btn btn-ok" href={`/letters/${c.id}/pdf`} download><Icon name="download" size={16} />הורדת PDF</a>
            <a className="btn" href={`/letters/${c.id}/print`} target="_blank" rel="noopener"><Icon name="eye" size={16} />צפייה</a>
            {forward}
          </div>
        </div>
      )}
      {letter.awaitingPayment && (
        <div className="callout warn"><div><Icon name="clock" /><b>המסמך מוכן · ממתין לתשלום.</b> הוא ייפתח כאן להורדה וישלח אליכם במייל מיד אחרי שהמרפאה תאשר את התשלום.</div></div>
      )}
      <div className="cols-side">
        <div className="stack">
          <NotesPanel notes={c.notes} extra={notes} />
          <DocsPanel docs={docs} />
          {actions}
        </div>
        <div className="stack">
          {payments.length > 0 && <PaymentSummary price={c.price} paid={paid} payer={c.payer} payments={payments} />}
          <section className="panel">
            <div className="panel-head"><h2><Icon name="calendarPlus" />זימון נוסף למטופל</h2></div>
            <p className="muted">צריך ביקור נוסף או מסמך נוסף לאותו מטופל? קובעים תור חדש בכמה קליקים.</p>
            <a className="btn btn-primary" href="/firm/book"><Icon name="calendarPlus" />זימון חדש</a>
            <a className="btn btn-ghost" href={`/firm/cases?open=${c.id}`}><Icon name="list" />כל ההפניות של המטופל</a>
          </section>
        </div>
      </div>
    </>
  );
}
