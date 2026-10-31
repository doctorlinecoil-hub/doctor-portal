'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase/browser';
import { requestLoginCode } from './actions';

export default function LoginForm() {
  const supabase = useSupabase();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // sign in with a password, or with a one-time code sent by email
  const [mode, setMode] = useState<'password' | 'code'>('password');
  const [sent, setSent] = useState('');
  const [code, setCode] = useState('');

  async function sendCode() {
    setBusy(true); setErr('');
    const r = await requestLoginCode(email.trim());
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setSent(r.info || 'נשלח קוד למייל.');
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    await supabase.auth.signOut().catch(() => {});
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
    if (error) { setBusy(false); return setErr('הקוד לא נכון או שפג תוקפו. אפשר לבקש קוד חדש.'); }
    router.replace('/');
    router.refresh();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    await supabase.auth.signOut().catch(() => {});
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      const m = (error.message || '').toLowerCase();
      setErr(error.status === 429 ? 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.'
        : m.includes('banned') ? 'החשבון עוד ממתין לאישור המרפאה (או שהגישה הושהתה). נעדכן אתכם במייל כשהוא יאושר.'
        : 'המייל או הסיסמה לא נכונים.');
      setBusy(false);
      return;
    }
    router.replace('/');
    router.refresh();
  }

  const tabs = (
    <div className="seg-login" role="tablist" aria-label="דרך הכניסה">
      <button type="button" role="tab" aria-selected={mode === 'password'} className={mode === 'password' ? 'on' : ''} onClick={() => { setMode('password'); setErr(''); }}>סיסמה</button>
      <button type="button" role="tab" aria-selected={mode === 'code'} className={mode === 'code' ? 'on' : ''} onClick={() => { setMode('code'); setErr(''); }}>קוד למייל</button>
    </div>
  );

  if (mode === 'code') {
    return (
      <form onSubmit={sent ? verify : (e) => { e.preventDefault(); sendCode(); }} className="stack" noValidate>
        {tabs}
        <label className="field" htmlFor="email"><span>אימייל</span>
          <input id="email" type="email" dir="ltr" autoComplete="username" value={email} onChange={(e) => { setEmail(e.target.value); setSent(''); }} required />
        </label>
        {sent && (
          <>
            <p className="ok-msg" role="status">{sent}</p>
            <label className="field" htmlFor="code"><span>קוד מהמייל</span>
              <input id="code" inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={10} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} style={{ letterSpacing: 6, fontSize: 22, textAlign: 'center' }} />
            </label>
          </>
        )}
        {err && <p className="err" role="alert">{err}</p>}
        {sent
          ? <><button className="btn btn-primary btn-lg" type="submit" disabled={busy || code.length < 6}>{busy ? 'נכנס…' : 'כניסה'}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={sendCode} disabled={busy}>שליחת קוד חדש</button></>
          : <button className="btn btn-primary btn-lg" type="submit" disabled={busy || !email}>{busy ? 'שולח…' : 'שליחת קוד למייל'}</button>}
        <small className="muted">אפשר גם ללחוץ על הקישור שבמייל. המערכת תפתח לבד את הפאנל המתאים לחשבון.</small>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="stack" noValidate>
      {tabs}
      <label className="field" htmlFor="email"><span>אימייל</span>
        <input id="email" type="email" dir="ltr" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="field" htmlFor="password"><span>סיסמה</span>
        <input id="password" type="password" dir="ltr" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn btn-primary btn-lg" type="submit" disabled={busy || !email || !password}>{busy ? 'נכנס…' : 'כניסה'}</button>
    </form>
  );
}
