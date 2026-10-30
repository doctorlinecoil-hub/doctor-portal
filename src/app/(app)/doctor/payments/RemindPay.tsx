'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { waLink } from '@/lib/messages';
import { remindPayment } from '../actions';

/** Remind whoever pays (the patient, or the referrer who opened the case): by email, or a ready WhatsApp message. */
export default function RemindPay({ id, who, phone, text, last, preview }: { id: string; who: string; phone: string | null; text: string; last?: string | null; preview?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const send = () => start(async () => {
    if (preview) return;
    const r = await remindPayment(id);
    setMsg({ ok: r.ok, t: r.ok ? r.info || 'התזכורת נשלחה' : r.error || 'השליחה נכשלה' });
    if (r.ok) router.refresh();
  });
  return (
    <div className="pp-remind">
      <span className="pp-remind-l"><Icon name="bell" size={14} />תזכורת תשלום ל{who}</span>
      <button type="button" className="btn btn-sm" disabled={pending} onClick={send}><Icon name="mail" size={14} />{pending ? 'שולח…' : 'במייל'}</button>
      {phone && <a className="btn btn-sm pp-wa" href={waLink(phone, text)} target="_blank" rel="noopener"><Icon name="message" size={14} />וואטסאפ</a>}
      {msg ? <small className={msg.ok ? 'ok-t' : 'bad-t'} role="status">{msg.t}</small> : last && <small className="muted">נשלחה תזכורת {last}</small>}
    </div>
  );
}
