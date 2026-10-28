'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { changePassword } from './actions';

export default function SetPasswordForm() {
  const router = useRouter();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (p1.length < 10) return setErr('הסיסמה צריכה להיות באורך 10 תווים לפחות.');
    if (p1 !== p2) return setErr('הסיסמאות לא זהות.');
    setBusy(true);
    setErr('');
    const r = await changePassword(p1);
    if (!r.ok) {
      setErr(r.error || 'לא הצלחנו לשמור את הסיסמה.');
      setBusy(false);
      return;
    }
    router.replace('/');
    router.refresh();
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
      <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>{busy ? 'שומר…' : 'שמירה והמשך'}</button>
    </form>
  );
}
