import Link from 'next/link';
import Icon from '@/components/Icon';
import { PAY_METHODS, ils, type PayMethod } from '@/lib/constants';
import { labelOf } from '@/lib/services';
import { dayNum, fmtDate, ilParts, todayIL } from '@/lib/dates';
import PayBoard, { type PayCard } from '@/components/PayBoard';
import type { ApptRow } from '@/lib/types';
import type { ProofCheck } from '@/lib/payCheck';

export type PayLine = { amount: number; method: PayMethod; paid_on: string };

/**
 * Documents that are ready and wait for the doctor's payment approval. The doctor sees what was paid
 * (amount and method), notes a payment if needed, and approves: the document opens and goes out by email.
 */
export function PendingPayView({ waiting, approved, gate, pays = {}, proofs = {}, action, remind, month = 0 }: {
  /** collected this month */
  month?: number;
  waiting: ApptRow[]; approved: ApptRow[]; gate: boolean; pays?: Record<string, PayLine[]>; proofs?: Record<string, { url: string; at: string; check?: ProofCheck | null }>;
  remind?: (r: ApptRow) => React.ReactNode;
  action: (r: ApptRow, undo?: boolean) => React.ReactNode;
}) {
  const to = (r: ApptRow) => (r.firm_kind === 'private' || r.payer === 'patient' ? 'המטופל' : r.firm_name || 'המפנה');
  const due = waiting.reduce((s, r) => s + Math.max(0, r.price - r.paid), 0);
  const today = dayNum(todayIL());
  const age = (r: ApptRow) => Math.max(0, today - dayNum(ilParts(r.starts_at).date));
  const nProofs = waiting.filter((r) => proofs[r.id]).length;
  // what needs the doctor first: a confirmation to check, then the oldest
  const ordered = [...waiting].sort((a, b) => Number(!!proofs[b.id]) - Number(!!proofs[a.id]) || age(b) - age(a));
  const Paid = ({ r }: { r: ApptRow }) => {
    const list = pays[r.id] ?? [];
    return (
      <div className="pp-paid">
        {list.length ? list.map((p, i) => (
          <span key={i} className="pp-chip ok"><Icon name="checkCircle" size={13} /><b className="num">{ils(p.amount)}</b>{PAY_METHODS[p.method]}<small className="num">{fmtDate(p.paid_on)}</small></span>
        )) : <span className="pp-chip none"><Icon name="clock" size={13} />לא נרשם תשלום</span>}
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
          <span><b className="num">{ils(due)}</b>פתוח לגבייה</span>
          <span className={nProofs ? 'hot' : ''}><b className="num">{nProofs}</b>אסמכתאות לבדיקה</span>
          <span><b className="num">{ils(month)}</b>נגבה החודש</span>
        </div>
      </section>
      {!gate && <p className="pp-info"><Icon name="info" size={16} />שחרור מסמכים לפי תשלום כבוי בהגדרות: כל מסמך סופי נפתח ונשלח מיד.</p>}

      {waiting.length === 0 ? (
        <section className="pp-card"><div className="pp-zero"><Icon name="checkCircle" size={22} />אין מסמכים שמחכים לתשלום.</div></section>
      ) : (
        <PayBoard cards={ordered.map((r): PayCard => {
          const d = age(r);
          const left = Math.max(0, r.price - r.paid);
          return {
            id: r.id, proof: !!proofs[r.id], days: d,
            search: [r.patient_name, r.firm_name, String(r.case_no), r.patient_id_number].filter(Boolean).join(' ').toLowerCase(),
            node: (
              <article className={`pp-item${proofs[r.id] ? ' has-proof' : ''}`}>
                <header>
                  <span className="fc-av">{(r.patient_name || '?').trim().slice(0, 1)}</span>
                  <Link href={`/doctor/cases/${r.id}`} className="pp-m">
                    <b>{r.patient_name || 'ממתין לפרטים'}</b>
                    <small>{labelOf(r)} · {fmtDate(ilParts(r.starts_at).date)} · תיק <span className="num">{r.case_no}</span></small>
                  </Link>
                  <a className="btn btn-sm btn-ghost" href={`/letters/${r.id}/print`} target="_blank" rel="noopener"><Icon name="eye" size={14} />המסמך</a>
                </header>
                <div className="pp-due">
                  <div><small>לגבייה מ{to(r)}</small><b className="num">{left > 0 ? ils(left) : r.price > 0 ? 'שולם במלואו' : 'ללא מחיר'}</b>{r.paid > 0 && left > 0 && <em className="num">מתוך {ils(r.price)}</em>}</div>
                  <span className={`pp-age${d >= 30 ? ' bad' : d >= 14 ? ' warn' : ''}`}><Icon name="clock" size={13} />{d === 0 ? 'היום' : d === 1 ? 'מאתמול' : `ממתין ${d} ימים`}</span>
                </div>
                <Paid r={r} />
                {proofs[r.id] && (
                  <div className="pp-proofw">
                    <a className="pp-proof" href={proofs[r.id].url} target="_blank" rel="noopener">
                      <Icon name="fileCheck" size={16} /><span><b>התקבל אישור העברה</b><small className="num">{proofs[r.id].at}</small></span><em>צפייה<Icon name="externalLink" size={13} /></em>
                    </a>
                    {proofs[r.id].check && <ProofCheckBox c={proofs[r.id].check!} />}
                  </div>
                )}
                {remind?.(r)}
                <footer>
                  <span className="pp-to"><Icon name="mail" size={14} />המסמך יישלח ל{to(r)}</span>
                  {action(r)}
                </footer>
              </article>
            ),
          };
        })} />
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

/** What the system read in the transfer confirmation; the doctor decides. */
function ProofCheckBox({ c }: { c: ProofCheck }) {
  const label = c.verdict === 'ok' ? 'נראה תקין' : c.verdict === 'bad' ? 'נראה לא תקין' : 'כדאי לבדוק';
  const facts = [
    c.amount != null ? `סכום ${ils(c.amount)}` : '',
    c.date ? `תאריך ${fmtDate(c.date)}` : '',
    c.recipient || c.account ? `מוטב ${[c.recipient, c.account].filter(Boolean).join(' · ')}` : '',
    c.reference ? `אסמכתא ${c.reference}` : '',
  ].filter(Boolean);
  return (
    <div className={`pp-check ${c.verdict}`}>
      <div className="pp-check-h"><Icon name={c.verdict === 'ok' ? 'checkCircle' : 'alert'} size={15} /><b>בדיקת המערכת: {label}</b></div>
      {c.summary && <p>{c.summary}</p>}
      {c.issues.length > 0 && <ul>{c.issues.map((i) => <li key={i}>{i}</li>)}</ul>}
      {facts.length > 0 && <small className="num">{facts.join(' · ')}</small>}
    </div>
  );
}
