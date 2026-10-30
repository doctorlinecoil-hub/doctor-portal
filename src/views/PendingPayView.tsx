import Link from 'next/link';
import Icon from '@/components/Icon';
import { PAY_METHODS, ils, type PayMethod } from '@/lib/constants';
import { labelOf } from '@/lib/services';
import { fmtDate, ilParts } from '@/lib/dates';
import type { ApptRow } from '@/lib/types';

export type PayLine = { amount: number; method: PayMethod; paid_on: string };

/**
 * Documents that are ready and wait for the doctor's payment approval. The doctor sees what was paid
 * (amount and method), notes a payment if needed, and approves: the document opens and goes out by email.
 */
export function PendingPayView({ waiting, approved, gate, pays = {}, action }: {
  waiting: ApptRow[]; approved: ApptRow[]; gate: boolean; pays?: Record<string, PayLine[]>;
  action: (r: ApptRow, undo?: boolean) => React.ReactNode;
}) {
  const to = (r: ApptRow) => (r.firm_kind === 'private' || r.payer === 'patient' ? 'המטופל' : r.firm_name || 'המפנה');
  const due = waiting.reduce((s, r) => s + Math.max(0, r.price - r.paid), 0);
  const Paid = ({ r }: { r: ApptRow }) => {
    const list = pays[r.id] ?? [];
    return (
      <div className="pp-paid">
        {list.length ? list.map((p, i) => (
          <span key={i} className="pp-chip ok"><Icon name="checkCircle" size={13} /><b className="num">{ils(p.amount)}</b>{PAY_METHODS[p.method]}<small className="num">{fmtDate(p.paid_on)}</small></span>
        )) : <span className="pp-chip none"><Icon name="clock" size={13} />לא נרשם תשלום</span>}
        {r.price > 0 && <span className="pp-price">מחיר <b className="num">{ils(r.price)}</b>{r.paid > 0 && r.paid + 0.001 < r.price && <> · נותר <b className="num">{ils(r.price - r.paid)}</b></>}</span>}
      </div>
    );
  };
  return (
    <div className="pp">
      <section className="pp-hero">
        <div>
          <span className="pp-kicker"><Icon name="wallet" size={14} />אישור תשלומים</span>
          <h1>{waiting.length ? (waiting.length === 1 ? 'מסמך אחד מחכה לאישור תשלום' : `${waiting.length} מסמכים מחכים לאישור תשלום`) : 'הכול מאושר'}</h1>
          <p>אחרי האישור המסמך נפתח לצפייה ונשלח במייל למפנה או למטופל.</p>
        </div>
        <div className="pp-hero-k">
          <span><b className="num">{waiting.length}</b>ממתינים</span>
          {due > 0 && <span><b className="num">{ils(due)}</b>פתוח לגבייה</span>}
        </div>
      </section>
      {!gate && <p className="pp-info"><Icon name="info" size={16} />שחרור מסמכים לפי תשלום כבוי בהגדרות: כל מסמך סופי נפתח ונשלח מיד.</p>}

      {waiting.length === 0 ? (
        <section className="pp-card"><div className="pp-zero"><Icon name="checkCircle" size={22} />אין מסמכים שמחכים לתשלום.</div></section>
      ) : (
        <div className="pp-grid">
          {waiting.map((r) => (
            <article key={r.id} className="pp-item">
              <header>
                <span className="fc-av">{(r.patient_name || '?').trim().slice(0, 1)}</span>
                <Link href={`/doctor/cases/${r.id}`} className="pp-m">
                  <b>{r.patient_name || 'ממתין לפרטים'}</b>
                  <small>{labelOf(r)} · {fmtDate(ilParts(r.starts_at).date)} · תיק <span className="num">{r.case_no}</span></small>
                </Link>
                <a className="btn btn-sm btn-ghost" href={`/letters/${r.id}/print`} target="_blank" rel="noopener"><Icon name="eye" size={14} />המסמך</a>
              </header>
              <Paid r={r} />
              <footer>
                <span className="pp-to"><Icon name="mail" size={14} />יישלח ל{to(r)}</span>
                {action(r)}
              </footer>
            </article>
          ))}
        </div>
      )}

      {approved.length > 0 && (
        <section className="pp-card">
          <div className="pp-h">
            <span className="pp-ic ok"><Icon name="checkCircle" size={19} /></span>
            <div><h2>אושרו לאחרונה</h2><p>המסמכים פתוחים ונשלחו במייל.</p></div>
          </div>
          <ul className="pp-list">
            {approved.map((r) => (
              <li key={r.id}>
                <span className="fc-av">{(r.patient_name || '?').trim().slice(0, 1)}</span>
                <Link href={`/doctor/cases/${r.id}`} className="pp-m">
                  <b>{r.patient_name || 'ממתין לפרטים'}</b>
                  <small>{labelOf(r)} · אושר {fmtDate(ilParts(r.payment_ok_at!).date)} · נשלח ל{to(r)}</small>
                </Link>
                <span className="pp-sum">{(pays[r.id] ?? []).map((p) => `${ils(p.amount)} ${PAY_METHODS[p.method]}`).join(' · ')}</span>
                <a className="btn btn-sm btn-ghost" href={`/letters/${r.id}/pdf`} download><Icon name="download" size={14} />PDF</a>
                {action(r, true)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
