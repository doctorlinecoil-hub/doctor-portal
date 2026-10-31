'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { PAY_METHODS, type PayMethod } from '@/lib/constants';
import { approvePayment, setPaymentOk } from '../actions';

// the clinic does not take credit cards
const QUICK: PayMethod[] = ['transfer', 'bit', 'cash', 'check', 'other'];

/**
 * Approve a payment. When the case is already paid in full: one click. Otherwise the doctor notes what
 * was received and how (or approves without an amount), and the document opens and goes out by email.
 */
export default function ApprovePay({ id, due, paidInFull, today, undo, preview, initialOpen }: { id: string; due: number; paidInFull?: boolean; today: string; undo?: boolean; preview?: boolean; initialOpen?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(!!initialOpen);
  const [msg, setMsg] = useState('');
  const [f, setF] = useState({ amount: due > 0 ? String(due) : '', method: 'transfer' as PayMethod, paidOn: today });
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => {
    if (preview) return;
    const r = await fn();
    setMsg(r.ok ? '' : r.error || 'לא הצלחנו לעדכן.');
    if (r.ok) { setOpen(false); router.refresh(); }
  });

  if (undo) {
    return <span className="pp-act"><button type="button" className="btn btn-sm btn-ghost" disabled={pending} onClick={() => run(() => setPaymentOk(id, false))}><Icon name="undo" size={14} />ביטול</button>{msg && <small className="bad-t" role="alert">{msg}</small>}</span>;
  }
  if (paidInFull) {
    return <span className="pp-act"><button type="button" className="btn btn-sm btn-ok" disabled={pending} onClick={() => run(() => approvePayment(id, null))}><Icon name="check" size={15} />{pending ? 'מאשר…' : 'אישור ושליחה'}</button>{msg && <small className="bad-t" role="alert">{msg}</small>}</span>;
  }
  if (!open) {
    return <span className="pp-act"><button type="button" className="btn btn-sm btn-ok" onClick={() => setOpen(true)}><Icon name="check" size={15} />אישור תשלום</button></span>;
  }
  const amount = Number(f.amount);
  return (
    <div className="pp-act open pp-form" role="group" aria-label="רישום התשלום שהתקבל">
      <div className="pp-form-h"><Icon name="wallet" size={17} /><b>כמה התקבל ואיך?</b><button type="button" className="fc-x sm" aria-label="סגירה" onClick={() => setOpen(false)}><Icon name="x" size={16} /></button></div>
      <div className="pp-form-row">
        <label className="field pp-amt"><span>סכום שהתקבל</span>
          <span className="pp-amt-in"><i>₪</i><input inputMode="decimal" dir="ltr" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.]/g, '') })} placeholder="0" autoFocus /></span>
        </label>
        <label className="field pp-date"><span>תאריך</span><input type="date" value={f.paidOn} max={today} onChange={(e) => setF({ ...f, paidOn: e.target.value })} /></label>
      </div>
      <div className="pp-methods" role="radiogroup" aria-label="אמצעי תשלום">
        {QUICK.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={f.method === m} className={f.method === m ? 'on' : ''} onClick={() => setF({ ...f, method: m })}>{PAY_METHODS[m]}</button>
        ))}
      </div>
      {msg && <p className="err" role="alert">{msg}</p>}
      <div className="pp-form-foot">
        <button type="button" className="btn btn-ok" disabled={pending || !(amount > 0)} onClick={() => run(() => approvePayment(id, { amount, method: f.method, paidOn: f.paidOn }))}>
          <Icon name="check" />{pending ? 'שומר…' : 'רישום, אישור ושליחת המסמך'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(() => approvePayment(id, null))}>אישור בלי לרשום סכום</button>
      </div>
    </div>
  );
}
