'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase/browser';
import { EMAIL_RE, dbError } from '@/lib/constants';
import type { Service } from '@/lib/services';
import ServicePicker from '@/components/ServicePicker';
import { ilToUtc } from '@/lib/dates';
import Icon from '@/components/Icon';

type Firm = { id: string; name: string; kind: string };

/** A new case without a slot: the doctor writes a letter or a prescription for anyone, any day. */
export default function NewCaseForm({ firms, services, initial, preview }: {
  firms: Firm[]; services: Service[]; preview?: boolean;
  initial: { firm: string; name: string; id: string; dob: string; phone: string; email: string; what: 'letter' | 'rx'; date: string; time: string };
}) {
  const supabase = useSupabase();
  const router = useRouter();
  const [f, setF] = useState({ ...initial, notes: '' });
  const [svc, setSvc] = useState<Service | null>(services.find((x) => x.base_type === 'summary') ?? services[0] ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const firm = firms.find((x) => x.id === f.firm);
  const emailOk = !f.email.trim() || EMAIL_RE.test(f.email.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const miss: string[] = [];
    if (!f.firm) miss.push('מפנה');
    if (!svc) miss.push('סוג המסמך');
    if (f.name.trim().length < 2) miss.push('שם המטופל');
    if (f.id.trim().length < 5) miss.push('תעודת זהות');
    if (f.phone.trim().length < 7) miss.push('טלפון');
    if (!emailOk) miss.push('מייל תקין');
    if (miss.length) return setErr('חסר: ' + miss.join(', '));
    if (preview) return setErr('תצוגה מקדימה.');
    setBusy(true);
    setErr('');
    const { data, error } = await supabase.from('appointments').insert({
      firm_id: f.firm, walk_in: true, starts_at: ilToUtc(f.date, f.time || '09:00').toISOString(), service_id: svc!.id, referral_type: svc!.base_type,
      payer: firm?.kind === 'private' ? 'patient' : 'referrer',
      patient_name: f.name.trim(), patient_id_number: f.id.trim(), patient_dob: f.dob || null, patient_phone: f.phone.trim(),
      patient_email: f.email.trim().toLowerCase(), notes: f.notes.trim(),
    }).select('id').single();
    setBusy(false);
    if (error || !data) return setErr(dbError(error));
    router.push(`/doctor/cases/${data.id}#${f.what}`);
  }

  const isRx = f.what === 'rx';
  const yesterday = (() => { const d = new Date(ilToUtc(initial.date, '12:00').getTime() - 86400000); return d.toISOString().slice(0, 10); })();
  const filled = [f.name.trim().length >= 2, f.id.trim().length >= 5, f.phone.trim().length >= 7].filter(Boolean).length;

  return (
    <form className="nd" onSubmit={submit} noValidate>
      <section className="nd-hero">
        <div>
          <span className="nd-kicker"><Icon name="sparkles" size={14} />מסמך חדש · גם בלי תור ביומן</span>
          <h1>מה מכינים היום?</h1>
          <p>בוחרים סוג, ממלאים פרטי מטופל, ונכנסים ישר לכתיבה. התיק נשמר בהיסטוריה של המטופל.</p>
        </div>
        <div className="nd-pick" role="radiogroup" aria-label="סוג המסמך">
          <button type="button" role="radio" aria-checked={!isRx} className={!isRx ? 'on' : ''} onClick={() => setF({ ...f, what: 'letter' })}>
            <span className="nd-pic"><Icon name="file" size={26} /></span>
            <b>מכתב / חוות דעת</b><small>סיכום ביקור, חוות דעת, הפניה</small>
            <span className="nd-tick"><Icon name="check" size={14} /></span>
          </button>
          <button type="button" role="radio" aria-checked={isRx} className={isRx ? 'on' : ''} onClick={() => setF({ ...f, what: 'rx' })}>
            <span className="nd-pic rx"><Icon name="pill" size={26} /></span>
            <b>מרשם תרופות</b><small>מרשם חתום, מוכן להדפסה ולשליחה</small>
            <span className="nd-tick"><Icon name="check" size={14} /></span>
          </button>
        </div>
      </section>

      <div className="nd-grid">
        <div className="nd-main">
          {!isRx && (
            <section className="nd-card">
              <div className="nd-h"><span className="nd-step">1</span><h2>סוג המכתב</h2></div>
              <ServicePicker services={services} value={svc?.id ?? null} onChange={setSvc} compact showPrice />
            </section>
          )}

          <section className="nd-card">
            <div className="nd-h"><span className="nd-step">{isRx ? 1 : 2}</span><h2>המטופל</h2><span className="nd-prog">{filled}/3</span></div>
            <div className="grid-2">
              <label className="field"><span>שם מלא</span><input value={f.name} onChange={set('name')} autoFocus={!f.name} placeholder="ישראל ישראלי" /></label>
              <label className="field"><span>תעודת זהות</span><input inputMode="numeric" dir="ltr" value={f.id} onChange={set('id')} placeholder="000000000" /></label>
              <label className="field"><span>טלפון</span><input type="tel" dir="ltr" value={f.phone} onChange={set('phone')} placeholder="050-0000000" /></label>
              <label className="field"><span>תאריך לידה <small>לא חובה</small></span><input type="date" value={f.dob} onChange={set('dob')} /></label>
            </div>
            <label className="field"><span>מייל <small>לא חובה · לשליחת {isRx ? 'המרשם' : 'המכתב'} למטופל</small></span><input type="email" dir="ltr" value={f.email} onChange={set('email')} aria-invalid={!emailOk} placeholder="name@example.com" /></label>
          </section>

          <section className="nd-card">
            <div className="nd-h"><span className="nd-step">{isRx ? 2 : 3}</span><h2>מפנה ומועד</h2></div>
            <label className="field"><span>מפנה <small>מטופל שפנה בעצמו = ״פניות ישירות״</small></span>
              <select value={f.firm} onChange={set('firm')}>{firms.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            </label>
            <div className="nd-when">
              <div className="nd-chips" role="group" aria-label="תאריך מהיר">
                <button type="button" aria-pressed={f.date === initial.date} onClick={() => setF({ ...f, date: initial.date })}>היום</button>
                <button type="button" aria-pressed={f.date === yesterday} onClick={() => setF({ ...f, date: yesterday })}>אתמול</button>
              </div>
              <label className="field"><span>תאריך הביקור</span><input type="date" value={f.date} onChange={set('date')} /></label>
              <label className="field"><span>שעה</span><input type="time" value={f.time} onChange={set('time')} /></label>
            </div>
            <label className="field"><span>הערות <small>לא חובה</small></span><textarea rows={2} value={f.notes} onChange={set('notes')} /></label>
          </section>
        </div>

        <aside className="nd-side">
          <div className="nd-sum">
            <span className={`nd-sum-ic${isRx ? ' rx' : ''}`}><Icon name={isRx ? 'pill' : 'file'} size={22} /></span>
            <b>{isRx ? 'מרשם תרופות' : svc?.label || 'מכתב'}</b>
            <dl>
              <dt>מטופל</dt><dd>{f.name.trim() || '—'}</dd>
              <dt>ת״ז</dt><dd className="num">{f.id.trim() || '—'}</dd>
              <dt>מפנה</dt><dd>{firm?.name || '—'}</dd>
              <dt>מועד</dt><dd className="num">{f.date.split('-').reverse().join('.')} · {f.time}</dd>
            </dl>
            {err && <p className="err" role="alert">{err}</p>}
            <button className="btn btn-primary btn-lg nd-go" disabled={busy}>{busy ? 'פותח…' : <><Icon name="marker" />{isRx ? 'לכתיבת המרשם' : 'לכתיבת המכתב'}</>}</button>
            <span className="hint"><Icon name="info" size={13} />לא נקבע תור ולא נשלח זימון.</span>
          </div>
        </aside>
      </div>
    </form>
  );
}
