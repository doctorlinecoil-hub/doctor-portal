'use client';
import { useState } from 'react';
import Icon from '@/components/Icon';
import { setNewPassword } from '../../register/actions';

export default function ResetForm({ token }: { token: string }) {
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (p1.length < 10) return setErr('הסיסמה צריכה להיות באורך 10 תווים לפחות.');
    if (p1 !== p2) return setErr('הסיסמאות לא זהות.');
    setBusy(true);
    setErr('');
    const r = await setNewPassword(token, p1).catch(() => ({ ok: false as const, error: 'אין חיבור. נסו שוב.' }));
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setDone(true);
  }

  if (done) {
    return (
      <div className="su-done" role="status">
        <span className="pb-check"><Icon name="check" /></span>
        <p>הסיסמה עודכנה. אפשר להתחבר עם הסיסמה החדשה.</p>
        <a className="btn btn-primary" href="/login">לכניסה</a>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="stack" noValidate>
      <label className="field" htmlFor="p1"><span>סיסמה חדשה <small>10 תווים לפחות</small></span>
        <input id="p1" type="password" dir="ltr" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} />
      </label>
      <label className="field" htmlFor="p2"><span>שוב את אותה סיסמה</span>
        <input id="p2" type="password" dir="ltr" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} />
      </label>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>{busy ? 'שומר…' : 'שמירת הסיסמה'}</button>
    </form>
  );
}
