'use client';
import { useState } from 'react';
import Icon from './Icon';
import { requestCallback } from '@/app/contact/actions';

/** "Call me back": name and phone only, for visitors who are not ready to book yet. */
export default function CallbackForm({ defaultKind = 'patient', dark }: { defaultKind?: 'law' | 'broker' | 'patient' | 'other'; dark?: boolean }) {
  const [f, setF] = useState({ name: '', phone: '', kind: defaultKind, note: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.name.trim().length < 2) return setErr('נא למלא שם.');
    if (f.phone.replace(/\D/g, '').length < 9) return setErr('נא למלא מספר טלפון תקין.');
    setBusy(true);
    setErr('');
    const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const source = [window.location.pathname, q?.get('utm_source'), q?.get('utm_campaign')].filter(Boolean).join(' · ');
    const r = await requestCallback({ ...f, source }).catch(() => ({ ok: false as const, error: 'אין חיבור. נסו שוב.' }));
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setDone(true);
  }

  if (done) {
    return (
      <div className={`cb-done${dark ? ' dark' : ''}`} role="status">
        <span><Icon name="check" /></span>
        <b>תודה, הפרטים התקבלו</b>
        <p>נחזור אליכם בהקדם, בדרך כלל עוד באותו יום עבודה.</p>
      </div>
    );
  }
  return (
    <form className={`cb-form${dark ? ' dark' : ''}`} onSubmit={submit} noValidate>
      <div className="cb-row">
        <label className="field"><span>שם מלא</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></label>
        <label className="field"><span>טלפון</span><input type="tel" dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" /></label>
      </div>
      <div className="cb-kinds" role="radiogroup" aria-label="פונה בתור">
        {([['patient', 'מטופל/ת'], ['law', 'משרד עורכי דין'], ['broker', 'מתווך / חברה']] as const).map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={f.kind === k} className={f.kind === k ? 'on' : ''} onClick={() => setF({ ...f, kind: k })}>{l}</button>
        ))}
      </div>
      <label className="field"><span>במה נוכל לעזור? <small>לא חובה</small></span><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="למשל: חוות דעת לביטוח לאומי" /></label>
      <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} name="website" />
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn btn-primary btn-lg" type="submit" disabled={busy}><Icon name="phone" />{busy ? 'שולח…' : 'חזרו אליי'}</button>
      <p className="cb-note">הפרטים משמשים רק כדי לחזור אליכם. <a href="/privacy">מדיניות פרטיות</a></p>
    </form>
  );
}
