import Link from 'next/link';
import Icon from '@/components/Icon';
import { Empty, PageHead, Stat } from '@/components/ui';
import { KindBadge, PayBadge } from '@/components/Badges';
import { PAYERS, TYPES, ils, payState, type PayState } from '@/lib/constants';
import { fmtDate, ilParts, todayIL } from '@/lib/dates';
import type { ApptRow } from '@/lib/types';

const FILTERS: { key: string; label: string }[] = [
  { key: 'open', label: 'לגבייה' },
  { key: 'unpaid', label: 'לא שולם' },
  { key: 'partial', label: 'שולם חלקית' },
  { key: 'paid', label: 'שולם' },
  { key: 'all', label: 'הכל' },
];

function matches(r: ApptRow, f: string) {
  const s: PayState = payState(r.price, r.paid);
  if (f === 'open') return s === 'unpaid' || s === 'partial';
  if (f === 'all') return true;
  return s === f;
}

export function PaymentsView({ rows, filter, q, collectedThisMonth }: { rows: ApptRow[]; filter: string; q: string; collectedThisMonth: number }) {
  const active = rows.filter((r) => r.status !== 'cancelled');
  const outstanding = active.reduce((s, r) => s + Math.max(0, r.price - r.paid), 0);
  const unpaid = active.filter((r) => payState(r.price, r.paid) === 'unpaid').length;
  const partial = active.filter((r) => payState(r.price, r.paid) === 'partial').length;
  const needle = q.trim();
  const list = active
    .filter((r) => matches(r, filter))
    .filter((r) => !needle || r.patient_name.includes(needle) || (r.firm_name ?? '').includes(needle) || String(r.case_no).includes(needle))
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));

  const byFirm = new Map<string, { name: string; kind: ApptRow['firm_kind']; due: number; count: number }>();
  for (const r of active) {
    const due = Math.max(0, r.price - r.paid);
    if (!due || r.payer !== 'referrer') continue;
    const k = r.firm_name ?? '';
    const cur = byFirm.get(k) ?? { name: k, kind: r.firm_kind, due: 0, count: 0 };
    cur.due += due; cur.count += 1;
    byFirm.set(k, cur);
  }
  const debtors = [...byFirm.values()].sort((a, b) => b.due - a.due);
  const href = (f: string, extra = '') => `/admin/payments?f=${f}${extra}`;

  return (
    <>
      <PageHead title="תשלומים" sub="מה שולם, מה פתוח ומי חייב. רישום תשלום והפקת חשבונית נעשים מתוך התיק." />
      <div className="stats">
        <Stat icon="wallet" label="יתרה לגבייה" value={ils(outstanding)} tone="bad" />
        <Stat icon="checkCircle" label={`נגבה ב${new Intl.DateTimeFormat('he-IL', { month: 'long', timeZone: 'Asia/Jerusalem' }).format(new Date())}`} value={ils(collectedThisMonth)} tone="ok" />
        <Stat icon="alert" label="תיקים שלא שולמו" value={unpaid} tone="warn" />
        <Stat icon="clock" label="שולמו חלקית" value={partial} tone="violet" />
      </div>
      <div className="stack">
        <section className="panel">
          <div className="panel-head"><h2><Icon name="users" />חובות לפי מפנה</h2></div>
          {debtors.length === 0 ? <p className="muted">אין חובות פתוחים של מפנים</p> : (
            <div className="grid-3">
              {debtors.map((d) => (
                <Link key={d.name} href={href('open', `&q=${encodeURIComponent(d.name)}`)} className="debtor">
                  <div className="stack-sm" style={{ gap: 4 }}>
                    <b>{d.name}</b>
                    <div className="row" style={{ gap: 6 }}>{d.kind && <KindBadge kind={d.kind} />}<span className="hint">{d.count} תיקים פתוחים</span></div>
                  </div>
                  <span className="money">{ils(d.due)}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
        <section className="panel flush">
          <div className="filters">
            <nav className="tabs" aria-label="סינון" style={{ boxShadow: 'none' }}>
              {FILTERS.map((t) => <Link key={t.key} href={href(t.key, needle ? `&q=${encodeURIComponent(needle)}` : '')} aria-current={filter === t.key}>{t.label}</Link>)}
            </nav>
            <form action="/admin/payments" style={{ marginInlineStart: 'auto' }}>
              <input type="hidden" name="f" value={filter} />
              <input type="search" name="q" defaultValue={needle} placeholder="חיפוש מטופל, מפנה או מספר תיק" aria-label="חיפוש" />
            </form>
          </div>
          {list.length === 0 ? <Empty icon="wallet">אין תיקים להצגה</Empty> : (
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>תיק</th><th>מטופל</th><th>מפנה</th><th>תאריך</th><th>משלם</th><th className="num">מחיר</th><th className="num">שולם</th><th>מצב</th><th /></tr></thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id}>
                      <td className="num muted">{r.case_no}</td>
                      <td><div className="cell-main"><b>{r.patient_name}</b><span>{TYPES[r.referral_type].label}</span></div></td>
                      <td>{r.firm_name}</td>
                      <td className="num">{fmtDate(ilParts(r.starts_at).date)}</td>
                      <td>{PAYERS[r.payer]}</td>
                      <td className="num money">{ils(r.price)}</td>
                      <td className="num">{ils(r.paid)}</td>
                      <td><PayBadge state={payState(r.price, r.paid)} /></td>
                      <td><Link className="btn btn-sm btn-soft" href={`/doctor/cases/${r.id}#payment`}><Icon name="plus" />תשלום</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      <p className="hint">נכון ל־{fmtDate(todayIL())}. מחירים כוללים מע״מ.</p>
    </>
  );
}
