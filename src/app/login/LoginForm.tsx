'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase/browser';

export default function LoginForm() {
  const supabase = useSupabase();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

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

  return (
    <form onSubmit={submit} className="stack" noValidate>
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
