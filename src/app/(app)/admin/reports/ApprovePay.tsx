'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { setPaymentOk } from '@/app/(app)/doctor/actions';

/** One click: the payment is approved, the document opens to the referrer and goes out by email. */
export default function ApprovePay({ id, undo }: { id: string; undo?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  const go = () => start(async () => {
    const r = await setPaymentOk(id, !undo);
    setMsg(r.ok ? '' : r.error || 'לא הצלחנו לעדכן.');
    if (r.ok) router.refresh();
  });
  return (
    <span className="pp-act">
      {undo
        ? <button type="button" className="btn btn-sm btn-ghost" disabled={pending} onClick={go}><Icon name="undo" size={14} />ביטול</button>
        : <button type="button" className="btn btn-sm btn-ok" disabled={pending} onClick={go}><Icon name="check" size={15} />{pending ? 'מאשר…' : 'אישור תשלום ושליחה'}</button>}
      {msg && <small className="bad-t" role="alert">{msg}</small>}
    </span>
  );
}
