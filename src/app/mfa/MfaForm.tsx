'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase/browser';

type Mode = { kind: 'loading' } | { kind: 'verify'; factorId: string } | { kind: 'enroll'; factorId: string; qr: string; secret: string } | { kind: 'error' };

export default function MfaForm() {
  const supabase = useSupabase();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>({ kind: 'loading' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (!alive) return;
      if (error) return setMode({ kind: 'error' });
      const verified = data.totp.find((f) => f.status === 'verified');
      if (verified) return setMode({ kind: 'verify', factorId: verified.id });
      for (const f of data.all) if (f.factor_type === 'totp' && f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      const en = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'מרפאה ' + new Date().toISOString().slice(0, 10) });
      if (!alive) return;
      if (en.error || !en.data) return setMode({ kind: 'error' });
      setMode({ kind: 'enroll', factorId: en.data.id, qr: en.data.totp.qr_code, secret: en.data.totp.secret });
    })();
    return () => { alive = false; };
  }, [supabase]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode.kind !== 'verify' && mode.kind !== 'enroll') return;
    setBusy(true);
    setErr('');
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: mode.factorId, code: code.replace(/\s/g, '') });
    if (error) {
      setErr('הקוד לא נכון או שפג תוקפו. נסו את הקוד החדש מהאפליקציה.');
      setBusy(false);
      return;
    }
    router.replace('/');
    router.refresh();
  }

  if (mode.kind === 'loading') return <p className="hint">טוען…</p>;
  if (mode.kind === 'error') return <p className="err">לא הצלחנו להתחיל את האימות. רעננו את העמוד.</p>;

  return (
    <form onSubmit={submit} className="stack" noValidate>
      {mode.kind === 'enroll' ? (
        <>
          <p>כדי להגן על המידע הרפואי, הכניסה של הצוות כוללת קוד מהטלפון.</p>
          <ol className="muted" style={{ margin: 0, paddingInlineStart: 18 }}>
            <li>התקינו בטלפון את Google Authenticator או Microsoft Authenticator.</li>
            <li>באפליקציה לחצו ״+״ וסרקו את הקוד.</li>
            <li>הקלידו כאן את 6 הספרות שמופיעות באפליקציה.</li>
          </ol>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="qr" src={mode.qr} alt="קוד לסריקה באפליקציית האימות" />
          <p className="hint">אי אפשר לסרוק? הקלידו באפליקציה את הקוד הזה:</p>
          <div className="secret">{mode.secret}</div>
        </>
      ) : (
        <p>הקלידו את 6 הספרות מאפליקציית האימות בטלפון.</p>
      )}
      <label className="field" htmlFor="code"><span>קוד מהאפליקציה</span>
        <input id="code" inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} />
      </label>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn btn-primary btn-lg" type="submit" disabled={busy || code.replace(/\s/g, '').length < 6}>{busy ? 'בודק…' : 'אישור'}</button>
    </form>
  );
}
