import Link from 'next/link';
import Icon from '@/components/Icon';
import { PageHead, Stat, Empty } from '@/components/ui';
import { PayBadge, StatusBadge, TypeBadge } from '@/components/Badges';
import { PAYERS, PAY_METHODS, ils, payState } from '@/lib/constants';
import { labelOf } from '@/lib/services';
import { age, fmtDate, fmtDay, fmtStamp, ilParts, todayIL } from '@/lib/dates';
import type { ApptRow, CaseDetail, DocRow, NoteRow, PaymentRow } from '@/lib/types';

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

export function FirmDashboardView({ firmName, clinicName, rows }: { firmName: string; clinicName: string; rows: ApptRow[] }) {
  const today = todayIL();
  const upcoming = rows.filter((r) => r.status !== 'cancelled' && ilParts(r.starts_at).date >= today).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const open = rows.filter((r) => r.status === 'pending' || r.status === 'booked' || r.status === 'draft').length;
  const pending = rows.filter((r) => r.status === 'pending').length;
  const ready = rows.filter((r) => r.status === 'done').sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const balance = rows.reduce((a, r) => a + owes(r), 0);
  return (
    <>
      <PageHead title={`שלום, ${firmName}`} sub={`ניהול תורים ותיקים מול ${clinicName}`}>
        <Link href="/firm/book" className="btn btn-primary btn-lg"><Icon name="calendarPlus" />קביעת תור חדש</Link>
      </PageHead>
      <div className="stats">
        <Stat icon="calendar" label="תורים קרובים" value={upcoming.length} tone="info" />
        <Stat icon="folder" label="תיקים בטיפול" value={open} tone="warn" sub={pending ? `${pending} ממתינים לאישור הרופא` : undefined} />
        <Stat icon="fileCheck" label="מכתבים מוכנים" value={ready.length} tone="ok" />
        <Stat icon="wallet" label="יתרה לתשלום" value={ils(balance)} tone={balance > 0 ? 'bad' : 'violet'} />
      </div>
      <div className="cols-side">
        <section className="panel flush">
          <div className="panel-head"><h2><Icon name="calendar" />התורים הקרובים</h2><Link href="/firm/cases" className="btn btn-ghost btn-sm">כל התיקים</Link></div>
          {upcoming.length === 0 ? <Empty icon="calendar">אין תורים קרובים. <Link href="/firm/book">לקביעת תור</Link></Empty> : (
            <div className="list">
              {groupByDay(upcoming.slice(0, 8)).map((g) => (
                <div key={g.date}>
                  <div className="list-day">{fmtDay(g.date)} <span>{fmtDate(g.date)}</span></div>
                  {g.rows.map((r) => <ApptItem key={r.id} r={r} href={`/firm/cases/${r.id}`} />)}
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="panel flush">
          <div className="panel-head"><h2><Icon name="fileCheck" />מכתבים מוכנים</h2></div>
          {ready.length === 0 ? <Empty icon="file">כשהרופא יסיים מכתב, הוא יופיע כאן.</Empty> : (
            <div className="list">
              {ready.slice(0, 6).map((r) => (
                <Link key={r.id} href={`/firm/cases/${r.id}`} className="item" style={{ gridTemplateColumns: '40px minmax(0,1fr) auto' }}>
                  <span className="file-ic" style={{ width: 36, height: 36 }}>PDF</span>
                  <span className="item-main"><b>{r.patient_name || 'ממתין לפרטים'}</b><span className="item-meta">{labelOf(r)} · תיק {r.case_no}</span></span>
                  <span className="item-side">{r.payer === 'referrer' && <PayBadge state={payState(r.price, r.paid)} />}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

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
  { key: 'upcoming', label: 'קרובים' },
  { key: 'open', label: 'בטיפול' },
  { key: 'done', label: 'מוכנים' },
  { key: 'cancelled', label: 'בוטלו' },
] as const;

export function filterFirmRows(rows: ApptRow[], f: string) {
  const today = todayIL();
  switch (f) {
    case 'upcoming': return rows.filter((r) => r.status !== 'cancelled' && ilParts(r.starts_at).date >= today).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
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

export function FirmCasesView({ rows: all, filter, q = '' }: { rows: ApptRow[]; filter: string; q?: string }) {
  const rows = searchFirmRows(all, q);
  const list = filterFirmRows(rows, filter);
  const qs = (f: string) => { const p = new URLSearchParams(); if (f !== 'all') p.set('f', f); if (q.trim()) p.set('q', q.trim()); const x = p.toString(); return x ? `/firm/cases?${x}` : '/firm/cases'; };
  return (
    <>
      <PageHead title="התיקים שלי" sub="כל התורים שקבעתם, הסטטוס של כל תיק והמכתבים המוכנים">
        <Link href="/firm/book" className="btn btn-primary"><Icon name="plus" />תור חדש</Link>
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
        {list.length === 0 ? <Empty>{q.trim().length >= 2 ? `לא נמצאו מטופלים עבור ״${q.trim()}״` : 'אין תיקים להצגה'}</Empty> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>תיק</th><th>מטופל</th><th>סוג</th><th>מועד</th><th>סטטוס</th><th>תשלום</th><th /></tr></thead>
              <tbody>
                {list.map((r) => {
                  const p = ilParts(r.starts_at);
                  return (
                    <tr key={r.id}>
                      <td className="num muted">{r.case_no}</td>
                      <td><Link href={`/firm/cases/${r.id}`} className="row-link"><b style={{ fontWeight: 500 }}>{r.patient_name || 'ממתין לפרטים'}</b></Link>{r.patient_id_number ? <div className="hint num">ת״ז {r.patient_id_number}</div> : null}</td>
                      <td>{labelOf(r)}</td>
                      <td className="num">{fmtDate(p.date)} <span className="muted">{p.time}</span></td>
                      <td><StatusBadge status={r.status} /></td>
                      <td>{r.payer === 'patient' ? <span className="muted">המטופל משלם</span> : <PayBadge state={payState(r.price, r.paid)} />}</td>
                      <td><Link href={`/firm/cases/${r.id}`} className="btn btn-ghost btn-sm">לתיק<Icon name="chevron" /></Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
            <a className="btn btn-ok" href={`/letters/${c.id}/print`} target="_blank" rel="noopener"><Icon name="download" />צפייה והורדת PDF</a>
            {forward}
          </div>
        </div>
      )}
      {letter.awaitingPayment && (
        <div className="callout warn"><div><Icon name="clock" />המכתב מוכן, והוא יהיה זמין להורדה מיד אחרי השלמת התשלום.</div></div>
      )}
      <div className="cols-side">
        <div className="stack">
          <NotesPanel notes={c.notes} extra={notes} />
          <DocsPanel docs={docs} />
          {actions}
        </div>
        <div className="stack">
          {c.payer === 'referrer' || payments.length ? <PaymentSummary price={c.price} paid={paid} payer={c.payer} payments={payments} /> : (
            <section className="panel"><div className="panel-head"><h2><Icon name="wallet" />תשלום</h2></div><p className="muted">המטופל משלם ישירות למרפאה.</p></section>
          )}
        </div>
      </div>
    </>
  );
}
