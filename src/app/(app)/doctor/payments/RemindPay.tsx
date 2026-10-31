'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { waLink } from '@/lib/messages';
import { rejectPayment, remindPayment } from '../actions';

const QUICK = [
  'האסמכתא שנשלחה לא ברורה או לא מלאה. נא לשלוח צילום ברור של אישור ההעברה.',
  'התשלום עדיין לא התקבל בחשבון. נא לבדוק את ההעברה ולשלוח אסמכתא עדכנית.',
  'הסכום שהתקבל נמוך מהסכום לתשלום. נא להשלים את היתרה ולשלוח אסמכתא.',
];

/**
 * Remind whoever pays (the patient, or the referrer who opened the case): by email, or a ready WhatsApp message.
 * When a confirmation is not right, the doctor writes what is wrong and it goes to the payer with a new upload link.
 */
export default function RemindPay({ id, who, phone, text, last, preview }: { id: string; who: string; phone: string | null; text: string; last?: string | null; preview?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(QUICK[0]);
  const send = () => start(async () => {
    if (preview) return;
    const r = await remindPayment(id);
    setMsg({ ok: r.ok, t: r.ok ? r.info || 'התזכורת נשלחה' : r.error || 'השליחה נכשלה' });
    if (r.ok) router.refresh();
  });
  const reject = () => start(async () => {
    if (preview) return;
    const r = await rejectPayment(id, note);
    setMsg({ ok: r.ok, t: r.ok ? r.info || 'ההודעה נשלחה' : r.error || 'השליחה נכשלה' });
    if (r.ok) { setOpen(false); router.refresh(); }
  });
  return (
    <div className="pp-remind">
      <span className="pp-remind-l"><Icon name="bell" size={14} />תזכורת תשלום ל{who}</span>
      <button type="button" className="btn btn-sm" disabled={pending} onClick={send}><Icon name="mail" size={14} />{pending && !open ? 'שולח…' : 'במייל'}</button>
      {phone && <a className="btn btn-sm pp-wa" href={waLink(phone, text)} target="_blank" rel="noopener"><Icon name="message" size={14} />וואטסאפ</a>}
      <button type="button" className="btn btn-sm pp-rej-btn" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="alert" size={14} />לא תקין</button>
      {open && (
        <div className="pp-rej" role="group" aria-label="הודעה למשלם על אסמכתא לא תקינה">
          <b>מה לכתוב ל{who}?</b>
          <div className="pp-rej-quick">
            {QUICK.map((q) => <button key={q} type="button" aria-pressed={note === q} onClick={() => setNote(q)}>{q.split('.')[0]}</button>)}
          </div>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} aria-label="ההודעה" />
          <small className="muted">ההודעה תישלח במייל עם פרטי התשלום וקישור חדש להעלאת אסמכתא.</small>
          <div className="pp-rej-a">
            <button type="button" className="btn btn-sm btn-primary" disabled={pending || note.trim().length < 3} onClick={reject}><Icon name="send" size={14} />{pending ? 'שולח…' : 'שליחה'}</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>ביטול</button>
          </div>
        </div>
      )}
      {msg ? <small className={msg.ok ? 'ok-t' : 'bad-t'} role="status">{msg.t}</small> : last && <small className="muted">נשלחה תזכורת {last}</small>}
    </div>
  );
}
