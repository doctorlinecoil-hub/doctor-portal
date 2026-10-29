'use client';
import { useState, useTransition } from 'react';
import Icon from '@/components/Icon';
import { forwardLetter } from '../../actions';

/** Sends the finished letter (as a PDF) to another address the referrer types. */
export default function ForwardLetter({ appointmentId }: { appointmentId: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  if (!open) return <button type="button" className="btn" onClick={() => setOpen(true)}><Icon name="mail" />שליחה למייל אחר</button>;
  return (
    <form className="forward" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await forwardLetter(appointmentId, email); setMsg({ ok: r.ok, text: r.info }); if (r.ok) setEmail(''); }); }}>
      <input type="email" dir="ltr" required placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="כתובת מייל" autoFocus />
      <button className="btn btn-primary" disabled={busy || !email.trim()}><Icon name="send" />{busy ? 'שולח…' : 'שליחה'}</button>
      {msg && <span className={msg.ok ? 'ok-msg' : 'err'} role="status">{msg.text}</span>}
    </form>
  );
}
