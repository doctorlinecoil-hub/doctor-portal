'use client';
import { useState } from 'react';
import { EMAIL_RE } from '@/lib/constants';
import Icon from '@/components/Icon';
import { registerAccount } from './actions';

type Kind = 'law' | 'broker' | 'company' | 'patient';
const KINDS: { k: Kind; label: string; icon: string; org: string }[] = [
  { k: 'law', label: 'משרד עורכי דין', icon: 'scale', org: 'שם המשרד' },
  { k: 'broker', label: 'מתווך / מיצוי זכויות', icon: 'handshake', org: 'שם העסק' },
  { k: 'company', label: 'חברה / ביטוח', icon: 'building', org: 'שם החברה' },
  { k: 'patient', label: 'מטופל/ת', icon: 'user', org: '' },
];

export default function RegisterForm({ initialKind }: { initialKind?: string }) {
  const [kind, setKind] = useState<Kind>((KINDS.find((x) => x.k === initialKind)?.k) ?? 'law');
  const [v, setV] = useState({ org: '', name: '', phone: '', email: '', password: '', password2: '', idNumber: '', licenseNo: '', note: '' });
  const [terms, setTerms] = useState(false);
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const meta = KINDS.find((x) => x.k === kind)!;
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const miss: string[] = [];
    if (kind !== 'patient' && v.org.trim().length < 2) miss.push(meta.org);
    if (v.name.trim().length < 2) miss.push('שם מלא');
    if (v.phone.replace(/\D/g, '').length < 9) miss.push('טלפון');
    if (!EMAIL_RE.test(v.email.trim())) miss.push('מייל תקין');
    if (kind === 'patient' && v.idNumber.replace(/\D/g, '').length < 5) miss.push('תעודת זהות');
    if (v.password.length < 10) miss.push('סיסמה של 10 תווים לפחות');
    else if (v.password !== v.password2) miss.push('אימות סיסמה זהה');
    if (!terms) miss.push('אישור התנאים');
    if (miss.length) return setErr('חסר: ' + miss.join(', '));
    setErr('');
    setBusy(true);
    const r = await registerAccount({ kind, org: v.org, name: v.name, phone: v.phone, email: v.email, password: v.password, idNumber: v.idNumber, licenseNo: v.licenseNo, note: v.note, terms, website })
      .catch(() => ({ ok: false as const, error: 'אין חיבור. נסו שוב.' }));
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setDone(true);
  }

  if (done) {
    return (
      <div className="su-done" role="status">
        <span className="pb-check"><Icon name="checkCircle" /></span>
        <h2>ההרשמה התקבלה</h2>
        <p className="muted">החשבון יפתח אחרי אישור המרפאה, ונעדכן אותך במייל <b dir="ltr">{v.email.trim()}</b>. אחרי האישור נכנסים עם המייל והסיסמה שבחרת.</p>
        <a className="btn" href="/book"><Icon name="calendarPlus" />בינתיים: קביעת תור</a>
      </div>
    );
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <div className="su-kinds" role="group" aria-label="סוג החשבון">
        {KINDS.map((x) => <button key={x.k} type="button" className="su-kind" aria-pressed={kind === x.k} onClick={() => setKind(x.k)}><Icon name={x.icon} />{x.label}</button>)}
      </div>
      {kind !== 'patient' && <label className="field"><span>{meta.org}</span><input value={v.org} onChange={set('org')} autoComplete="organization" /></label>}
      <label className="field"><span>{kind === 'patient' ? 'שם מלא' : 'שם איש הקשר'}</span><input value={v.name} onChange={set('name')} autoComplete="name" /></label>
      <div className="grid-2">
        <label className="field"><span>טלפון</span><input type="tel" dir="ltr" value={v.phone} onChange={set('phone')} autoComplete="tel" /></label>
        {kind === 'patient'
          ? <label className="field"><span>תעודת זהות</span><input inputMode="numeric" dir="ltr" value={v.idNumber} onChange={set('idNumber')} /></label>
          : kind === 'law'
            ? <label className="field"><span>מספר רישיון <small>לא חובה</small></span><input dir="ltr" value={v.licenseNo} onChange={set('licenseNo')} /></label>
            : <span />}
      </div>
      <label className="field"><span>מייל <small>איתו נכנסים למערכת</small></span><input type="email" dir="ltr" value={v.email} onChange={set('email')} autoComplete="email" /></label>
      <div className="grid-2">
        <label className="field"><span>סיסמה <small>10 תווים לפחות</small></span><input type="password" dir="ltr" value={v.password} onChange={set('password')} autoComplete="new-password" /></label>
        <label className="field"><span>אימות סיסמה</span><input type="password" dir="ltr" value={v.password2} onChange={set('password2')} autoComplete="new-password" /></label>
      </div>
      {kind !== 'patient' && <label className="field"><span>הערה למרפאה <small>לא חובה</small></span><textarea rows={2} value={v.note} onChange={set('note')} placeholder="למשל: כמה מטופלים בחודש, סוג התיקים" /></label>}
      <label className="su-terms"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} /><span>קראתי ואני מסכים/ה ל<a href="/terms" target="_blank">תנאי השימוש</a> ול<a href="/privacy" target="_blank">מדיניות הפרטיות</a>, כולל שמירת מסמכים רפואיים במערכת לצורך הטיפול בפנייה.</span></label>
      <input className="pb-hp" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} aria-hidden="true" placeholder="website" />
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>{busy ? 'שולח…' : 'הרשמה'}</button>
    </form>
  );
}
