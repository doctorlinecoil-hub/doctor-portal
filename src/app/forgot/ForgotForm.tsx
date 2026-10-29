'use client';
import { useState } from 'react';
import { EMAIL_RE } from '@/lib/constants';
import Icon from '@/components/Icon';
import { requestTempPassword } from '../register/actions';

export default function ForgotForm() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) return setMsg({ ok: false, text: 'כתובת המייל לא תקינה.' });
    setBusy(true);
    const r = await requestTempPassword(email).catch(() => ({ ok: false as const, error: 'אין חיבור. נסו שוב.' }));
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: r.info || 'נשלח.' } : { ok: false, text: r.error });
  }

  if (msg?.ok) {
    return (
      <div className="su-done" role="status">
        <span className="pb-check"><Icon name="mail" /></span>
        <p>{msg.text}</p>
        <a className="btn btn-primary" href="/login">לכניסה עם הסיסמה הזמנית</a>
      </div>
    );
  }
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <label className="field"><span>המייל שאיתו נרשמתם</span><input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
      {msg && <p className="err" role="alert">{msg.text}</p>}
      <button className="btn btn-primary btn-lg" type="submit" disabled={busy || !email}>{busy ? 'שולח…' : 'שליחת סיסמה זמנית'}</button>
    </form>
  );
}
