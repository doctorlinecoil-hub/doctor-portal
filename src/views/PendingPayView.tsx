import Link from 'next/link';
import Icon from '@/components/Icon';
import { ils } from '@/lib/constants';
import { labelOf } from '@/lib/services';
import { fmtDate, ilParts } from '@/lib/dates';
import type { ApptRow } from '@/lib/types';

/**
 * Documents that are ready but wait for the doctor's payment approval. One click approves, opens the
 * document to the referrer and emails it (to the referrer, and to the patient when there is an address).
 */
export function PendingPayView({ waiting, approved, gate, action }: {
  waiting: ApptRow[]; approved: ApptRow[]; gate: boolean;
  action: (id: string, undo?: boolean) => React.ReactNode;
}) {
  const to = (r: ApptRow) => (r.firm_kind === 'private' || r.payer === 'patient' ? 'למטופל' : `ל${r.firm_name || 'מפנה'}`);
  return (
    <div className="pp">
      {!gate && <p className="pp-info"><Icon name="info" size={16} />שחרור מסמכים לפי תשלום כבוי בהגדרות: כל מסמך סופי נפתח ונשלח מיד.</p>}
      <section className="pp-card">
        <div className="pp-h">
          <span className="pp-ic"><Icon name="clock" size={19} /></span>
          <div><h2>ממתינים לתשלום</h2><p>המסמך מוכן. אחרי האישור הוא נפתח לצפייה ונשלח במייל.</p></div>
          <span className="pp-count">{waiting.length}</span>
        </div>
        {waiting.length === 0 ? (
          <div className="pp-zero"><Icon name="checkCircle" />אין מסמכים שמחכים לתשלום.</div>
        ) : (
          <ul className="pp-list">
            {waiting.map((r) => (
              <li key={r.id}>
                <span className="fc-av">{(r.patient_name || '?').trim().slice(0, 1)}</span>
                <Link href={`/doctor/cases/${r.id}`} className="pp-m">
                  <b>{r.patient_name || 'ממתין לפרטים'}</b>
                  <small>{labelOf(r)} · {fmtDate(ilParts(r.starts_at).date)} · תיק <span className="num">{r.case_no}</span></small>
                </Link>
                <span className="pp-to"><Icon name="mail" size={14} />{to(r)}</span>
                <span className="pp-sum num">{r.price > 0 ? (r.paid > 0 ? `שולם ${ils(r.paid)} מ־${ils(r.price)}` : ils(r.price)) : ''}</span>
                <a className="btn btn-sm btn-ghost" href={`/letters/${r.id}/print`} target="_blank" rel="noopener"><Icon name="eye" size={14} />צפייה</a>
                {action(r.id)}
              </li>
            ))}
          </ul>
        )}
      </section>

      {approved.length > 0 && (
        <section className="pp-card">
          <div className="pp-h">
            <span className="pp-ic ok"><Icon name="checkCircle" size={19} /></span>
            <div><h2>אושרו לאחרונה</h2><p>המסמכים פתוחים למפנים ונשלחו במייל.</p></div>
          </div>
          <ul className="pp-list">
            {approved.map((r) => (
              <li key={r.id} className="done">
                <span className="fc-av">{(r.patient_name || '?').trim().slice(0, 1)}</span>
                <Link href={`/doctor/cases/${r.id}`} className="pp-m">
                  <b>{r.patient_name || 'ממתין לפרטים'}</b>
                  <small>{labelOf(r)} · אושר {fmtDate(ilParts(r.payment_ok_at!).date)}</small>
                </Link>
                <span className="pp-to"><Icon name="mail" size={14} />{to(r)}</span>
                <span className="pp-sum" />
                <a className="btn btn-sm btn-ghost" href={`/letters/${r.id}/pdf`} download><Icon name="download" size={14} />PDF</a>
                {action(r.id, true)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
