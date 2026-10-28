import Link from 'next/link';
import Icon from '@/components/Icon';
import { PageHead, Stat, Empty } from '@/components/ui';
import { PayBadge, StatusBadge, TypeBadge } from '@/components/Badges';
import { PAYERS, PAY_METHODS, TYPES, ils, payState } from '@/lib/constants';
import { age, fmtDate, fmtDay, fmtStamp, ilParts, todayIL } from '@/lib/dates';
import type { ApptRow, CaseDetail, DocRow, NoteRow, PaymentRow } from '@/lib/types';

function owes(r: ApptRow) {
  return r.status !== 'cancelled' && r.payer === 'referrer' ? Math.max(0, r.price - r.paid) : 0;
}

export function ApptItem({ r, href, staff }: { r: ApptRow; href: string; staff?: boolean }) {
  const p = ilParts(r.starts_at);
  return (
    <Link href={href} className="item">
      <span className="item-time">{p.time}<small>{fmtDay(p.date).split(',')[0]}</small></span>
      <span className="item-main">
        <b>{r.patient_name}</b>
        <span className="item-meta">
          <span>{TYPES[r.referral_type].label}</span>
          <span>·</span>
          <span className="num">תיק {r.case_no}</span>
          {r.firm_name && <><span>·</span><span>{r.firm_name}</span></>}
        </span>
      </span>
      <span className="item-side"><StatusBadge status={r.status} staff={staff} /></span>
    </Link>
  );
}

export function FirmDashboardView({ firmName, clinicName, rows }: { firmName: string; clinicName: string; rows: ApptRow[] }) {
  const today = todayIL();
  const upcoming = rows.filter((r) => r.status !== 'cancelled' && ilParts(r.starts_at).date >= today).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const open = rows.filter((r) => r.status === 'booked' || r.status === 'draft').length;
  const ready = rows.filter((r) => r.status === 'done').sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const balance = rows.reduce((a, r) => a + owes(r), 0);
  return (
    <>
      <PageHead title={`שלום, ${firmName}`} sub={`ניהול תורים ותיקים מול ${clinicName}`}>
        <Link href="/firm/book" className="btn btn-primary btn-lg"><Icon name="calendarPlus" />קביעת תור חדש</Link>
      </PageHead>
      <div className="stats">
        <Stat icon="calendar" label="תורים קרובים" value={upcoming.length} tone="info" />
        <Stat icon="folder" label="תיקים בטיפול" value={open} tone="warn" />
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
                  <span className="item-main"><b>{r.patient_name}</b><span className="item-meta">{TYPES[r.referral_type].label} · תיק {r.case_no}</span></span>
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
    case 'open': return rows.filter((r) => r.status === 'booked' || r.status === 'draft');
    case 'done': return rows.filter((r) => r.status === 'done');
    case 'cancelled': return rows.filter((r) => r.status === 'cancelled');
    default: return rows;
  }
}

export function FirmCasesView({ rows, filter }: { rows: ApptRow[]; filter: string }) {
  const list = filterFirmRows(rows, filter);
  return (
    <>
      <PageHead title="התיקים שלי" sub="כל התורים שקבעתם, הסטטוס של כל תיק והמכתבים המוכנים">
        <Link href="/firm/book" className="btn btn-primary"><Icon name="plus" />תור חדש</Link>
      </PageHead>
      <nav className="tabs" aria-label="סינון">
        {FIRM_FILTERS.map((t) => (
          <Link key={t.key} href={t.key === 'all' ? '/firm/cases' : `/firm/cases?f=${t.key}`} aria-current={filter === t.key}>
            {t.label}<span className="count num">{filterFirmRows(rows, t.key).length}</span>
          </Link>
        ))}
      </nav>
      <section className="panel flush">
        {list.length === 0 ? <Empty>אין תיקים להצגה</Empty> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>תיק</th><th>מטופל</th><th>סוג</th><th>מועד</th><th>סטטוס</th><th>תשלום</th><th /></tr></thead>
              <tbody>
                {list.map((r) => {
                  const p = ilParts(r.starts_at);
                  return (
                    <tr key={r.id}>
                      <td className="num muted">{r.case_no}</td>
                      <td><Link href={`/firm/cases/${r.id}`} className="row-link"><b style={{ fontWeight: 500 }}>{r.patient_name}</b></Link></td>
                      <td>{TYPES[r.referral_type].label}</td>
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

export function CaseHero({ c, staff, children }: { c: CaseDetail; staff?: boolean; children?: React.ReactNode }) {
  const p = ilParts(c.starts_at);
  const a = age(c.patient_dob);
  return (
    <section className="case-hero">
      <div className="case-id">
        <div className="case-avatar"><Icon name="user" /></div>
        <div>
          <div className="case-no">תיק מס׳ {c.case_no}</div>
          <h1>{c.patient_name}</h1>
          <div className="facts">
            <span className="fact"><Icon name="calendar" />{fmtDay(p.date)} · {p.time}</span>
            <span className="fact"><Icon name="idcard" /><span className="num">{c.patient_id_number}</span></span>
            {a != null && <span className="fact"><Icon name="cake" />גיל {a}</span>}
            <span className="fact"><Icon name="phone" /><span className="num ltr">{c.patient_phone}</span></span>
          </div>
        </div>
      </div>
      <div className="case-side">
        <div className="row"><TypeBadge type={c.referral_type} /><StatusBadge status={c.status} staff={staff} /></div>
        {children}
      </div>
    </section>
  );
}

export function NotesPanel({ notes, extra }: { notes: string; extra: NoteRow[] }) {
  return (
    <section className="panel">
      <div className="panel-head"><h2><Icon name="info" />בקשת המפנה</h2></div>
      <p className="note">{notes || <span className="muted">לא נכתבו הערות</span>}</p>
      {extra.map((n) => (
        <div className="note-item" key={n.id}><span className="hint">נוסף {fmtStamp(n.created_at)}</span><p className="note">{n.body}</p></div>
      ))}
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

export function FirmCaseView({ c, notes, docs, payments, paid, letter, actions }: {
  c: CaseDetail; notes: NoteRow[]; docs: DocRow[]; payments: PaymentRow[]; paid: number;
  letter: { ready: boolean; awaitingPayment: boolean; finalizedAt: string | null }; actions: React.ReactNode;
}) {
  return (
    <>
      <PageHead title="" crumbs={[{ href: '/firm/cases', label: 'התיקים שלי' }]} />
      <CaseHero c={c} />
      {letter.ready && (
        <div className="callout">
          <div><Icon name="checkCircle" />המכתב של הרופא מוכן{letter.finalizedAt ? ` · ${fmtStamp(letter.finalizedAt)}` : ''}</div>
          <a className="btn btn-ok" href={`/letters/${c.id}/print`} target="_blank" rel="noopener"><Icon name="download" />צפייה והורדת PDF</a>
        </div>
      )}
      {letter.awaitingPayment && (
        <div className="callout warn"><div><Icon name="clock" />המכתב מוכן, והוא יהיה זמין להורדה מיד אחרי השלמת התשלום.</div></div>
      )}
      <div className="cols">
        <div className="stack">
          {c.payer === 'referrer' || payments.length ? <PaymentSummary price={c.price} paid={paid} payer={c.payer} payments={payments} /> : (
            <section className="panel"><div className="panel-head"><h2><Icon name="wallet" />תשלום</h2></div><p className="muted">המטופל משלם ישירות למרפאה.</p></section>
          )}
          <NotesPanel notes={c.notes} extra={notes} />
        </div>
        <div className="stack">
          <DocsPanel docs={docs} />
          {actions}
        </div>
      </div>
    </>
  );
}
