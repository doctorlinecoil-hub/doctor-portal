'use client';
import { useState, useTransition } from 'react';
import Icon from '@/components/Icon';
import { setPaymentOk } from '../../actions';

/** The doctor approves the payment: only then the referrer sees and receives the document. */
export default function PaymentRelease({ id, ok, paidInFull, letterFinal }: { id: string; ok: boolean; paidInFull: boolean; letterFinal: boolean }) {
  const [on, setOn] = useState(ok);
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();
  const released = on || paidInFull;
  const flip = (v: boolean) => start(async () => {
    const r = await setPaymentOk(id, v);
    if (r.ok) setOn(v);
    setMsg(r.ok ? r.info || '' : r.error || 'לא הצלחנו לעדכן.');
  });
  return (
    <section className={`panel pay-release${released ? ' ok' : ''}`}>
      <div className="panel-head"><h2><Icon name={released ? 'checkCircle' : 'clock'} />{released ? 'התשלום אושר' : 'ממתין לאישור תשלום'}</h2></div>
      <p className="muted">{released
        ? (letterFinal ? 'המסמך זמין למפנה להורדה ונשלח אליו במייל.' : 'כשהמסמך יהיה סופי, הוא יהיה זמין למפנה מיד.')
        : 'המפנה רואה ״המסמך מוכן · ממתין לתשלום״. אחרי שתאשר, המסמך ייפתח לו להורדה וישלח אליו במייל.'}</p>
      {!paidInFull && (on
        ? <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => flip(false)}><Icon name="undo" />ביטול אישור התשלום</button>
        : <button type="button" className="btn btn-ok" disabled={pending} onClick={() => flip(true)}><Icon name="check" />{pending ? 'מאשר…' : 'אישור תשלום ושחרור המסמך'}</button>)}
      {msg && <p className="hint" role="status">{msg}</p>}
    </section>
  );
}
