'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase/browser';
import { EMAIL_RE, dbError } from '@/lib/constants';
import type { Service } from '@/lib/services';
import ServicePicker from '@/components/ServicePicker';
import { ilToUtc } from '@/lib/dates';
import Icon from '@/components/Icon';
import { PageHead } from '@/components/ui';

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

  return (
    <>
      <PageHead title="מסמך חדש" sub="מכתב או מרשם לכל מטופל, גם בלי תור ביומן. התיק נשמר בהיסטוריה של המטופל, וכל השליחות עובדות כרגיל." />
      <form className="panel new-doc" onSubmit={submit} noValidate>
        <div className="form-sec first">
          <h3><Icon name="file" />מה מכינים?</h3>
          <div className="seg">
            <button type="button" aria-pressed={f.what === 'letter'} onClick={() => setF({ ...f, what: 'letter' })}><Icon name="file" />מכתב / חוות דעת</button>
            <button type="button" aria-pressed={f.what === 'rx'} onClick={() => setF({ ...f, what: 'rx' })}><Icon name="pill" />מרשם תרופות</button>
          </div>
          <ServicePicker services={services} value={svc?.id ?? null} onChange={setSvc} compact />
        </div>

        <div className="form-sec">
          <h3><Icon name="user" />המטופל</h3>
          <div className="grid-2">
            <label className="field"><span>שם מלא</span><input value={f.name} onChange={set('name')} autoFocus={!f.name} /></label>
            <label className="field"><span>תעודת זהות</span><input inputMode="numeric" dir="ltr" value={f.id} onChange={set('id')} /></label>
            <label className="field"><span>תאריך לידה</span><input type="date" value={f.dob} onChange={set('dob')} /></label>
            <label className="field"><span>טלפון</span><input type="tel" dir="ltr" value={f.phone} onChange={set('phone')} /></label>
          </div>
          <label className="field"><span>מייל <small>לא חובה · לשליחת המכתב או המרשם</small></span><input type="email" dir="ltr" value={f.email} onChange={set('email')} aria-invalid={!emailOk} /></label>
        </div>

        <div className="form-sec">
          <h3><Icon name="briefcase" />מפנה ומועד</h3>
          <div className="grid-2">
            <label className="field"><span>מפנה <small>מטופל שפנה בעצמו = ״פניות ישירות״</small></span>
              <select value={f.firm} onChange={set('firm')}>{firms.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            </label>
            <div className="grid-2 tight">
              <label className="field"><span>תאריך הביקור</span><input type="date" value={f.date} onChange={set('date')} /></label>
              <label className="field"><span>שעה</span><input type="time" value={f.time} onChange={set('time')} /></label>
            </div>
          </div>
          <label className="field"><span>הערות <small>לא חובה</small></span><textarea rows={2} value={f.notes} onChange={set('notes')} /></label>
        </div>

        {err && <p className="err" role="alert">{err}</p>}
        <div className="form-foot">
          <span className="hint"><Icon name="info" size={14} />לא נקבע תור ולא נשלח זימון.</span>
          <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'פותח…' : <><Icon name={f.what === 'rx' ? 'pill' : 'file'} />פתיחת התיק ו{f.what === 'rx' ? 'כתיבת מרשם' : 'כתיבת המכתב'}</>}</button>
        </div>
      </form>
    </>
  );
}
