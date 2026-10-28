'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase/browser';
import { EMAIL_RE, PAYERS, TYPES, dbError, ils, type Payer, type ReferralType } from '@/lib/constants';
import { afterBooking } from '../actions';
import { DAYS, fmtDate, fmtDay, ilParts, weekday } from '@/lib/dates';
import type { DaySlots } from '@/lib/slots';
import { uploadCaseFiles } from '@/lib/upload';
import FilePicker from '@/components/FilePicker';
import Icon from '@/components/Icon';
import { PageHead } from '@/components/ui';

type Props = { firmId: string; slots: DaySlots[]; horizon: number; prices: Record<ReferralType, number>; clinicName: string; needsApproval: boolean; preview?: boolean };
const EMPTY = { name: '', id: '', dob: '', phone: '', email: '', notes: '' };

export default function BookingForm({ firmId, slots, horizon, prices, clinicName, needsApproval, preview }: Props) {
  const supabase = useSupabase();
  const router = useRouter();
  const [type, setType] = useState<ReferralType | null>(preview ? 'nii' : null);
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const visible = useMemo(
    () => slots.map((d) => ({ ...d, times: d.times.filter((t) => !taken.has(t.iso)) })).filter((d) => d.times.length),
    [slots, taken],
  );
  const [day, setDay] = useState<string | null>(visible[0]?.date ?? null);
  const [slot, setSlot] = useState<string | null>(preview ? visible[0]?.times[1]?.iso ?? null : null);
  const [payer, setPayer] = useState<Payer>('referrer');
  const [f, setF] = useState(preview ? { name: 'ישראל ישראלי', id: '012345678', dob: '1980-05-12', phone: '050-1234567', email: '', notes: 'תאונת עבודה מ־03.2025, נפילה מסולם. תביעה לביטוח לאומי.' } : EMPTY);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ id: string; slot: string; name: string; type: ReferralType; failed: string[]; count: number; pending: boolean; email: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const dayTimes = visible.find((d) => d.date === day)?.times ?? [];
  const chosen = slot ? ilParts(slot) : null;
  const price = type ? Number(prices?.[type] || 0) : 0;
  const emailOk = !f.email.trim() || EMAIL_RE.test(f.email.trim());
  const patientOk = f.name.trim().length >= 2 && f.id.trim().length >= 5 && f.phone.trim().length >= 7 && emailOk;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const miss = [];
    if (!type) miss.push('סוג ההפניה');
    if (!slot) miss.push('מועד התור');
    if (f.name.trim().length < 2) miss.push('שם המטופל');
    if (f.id.trim().length < 5) miss.push('תעודת זהות');
    if (f.phone.trim().length < 7) miss.push('טלפון');
    if (!emailOk) miss.push('אימייל תקין של המטופל (או להשאיר ריק)');
    if (miss.length) return setErr('חסר: ' + miss.join(', '));
    if (preview) return setErr('זו תצוגה מקדימה. במערכת האמיתית התור נשמר כאן.');
    setBusy(true);
    setErr('');
    const { data, error } = await supabase
      .from('appointments')
      .insert({
        firm_id: firmId, starts_at: slot, referral_type: type, payer, patient_name: f.name.trim(), patient_id_number: f.id.trim(),
        patient_dob: f.dob || null, patient_phone: f.phone.trim(), patient_email: f.email.trim().toLowerCase(), notes: f.notes.trim(),
      })
      .select('id, status')
      .single();
    if (error || !data) {
      if ((error?.code === '23505' || error?.code === '23P01') && slot) {
        setTaken(new Set([...taken, slot]));
        setSlot(null);
      }
      setErr(dbError(error));
      setBusy(false);
      return;
    }
    let failed: string[] = [];
    if (files.length) {
      setProgress(0);
      failed = await uploadCaseFiles(supabase, firmId, data.id, files, (d, t) => setProgress(d / t));
    }
    // tell the doctor, send the summons when no approval is needed, and start the AI scan of the documents
    await afterBooking(data.id).catch(() => undefined);
    setDone({ id: data.id, slot: slot!, name: f.name.trim(), type: type!, failed, count: files.length, pending: data.status === 'pending', email: f.email.trim() });
    setBusy(false);
    setProgress(null);
    router.refresh();
  }

  if (done) {
    const p = ilParts(done.slot);
    return (
      <>
        <PageHead title={done.pending ? 'הבקשה נשלחה לרופא' : 'התור נקבע'} sub={done.pending ? `${clinicName} יאשר את התור, ואז יישלח זימון במייל` : `הזימון נשלח במייל`} />
        <section className="panel success-card" style={{ maxWidth: 680 }}>
          <div className="success-mark"><Icon name={done.pending ? 'clock' : 'checkCircle'} /></div>
          <div className={`callout${done.pending ? ' warn' : ''}`}><div><Icon name={done.pending ? 'clock' : 'checkCircle'} />{done.name} · {fmtDay(p.date)} בשעה {p.time}{done.pending ? ' · ממתין לאישור הרופא' : ''}</div></div>
          <dl className="kv">
            <dt>סוג</dt><dd>{TYPES[done.type].label}</dd>
            <dt>מסמכים</dt><dd>{done.count ? `${done.count - done.failed.length} קבצים הועברו לרופא` : 'לא צורפו. אפשר להוסיף מתוך התיק.'}</dd>
            <dt>זימון</dt><dd>{done.email ? `יישלח למטופל (${done.email}) ואליכם` : 'יישלח אליכם במייל. נא להעביר אותו למטופל.'}</dd>
          </dl>
          {done.failed.length > 0 && <p className="err">הקבצים האלה לא הועלו: {done.failed.join(', ')}. אפשר להוסיף אותם שוב מתוך התיק.</p>}
          <div className="row">
            <Link className="btn btn-primary" href={`/firm/cases/${done.id}`}><Icon name="folder" />מעבר לתיק</Link>
            <button type="button" className="btn" onClick={() => { setDone(null); setType(null); setSlot(null); setFiles([]); setF(EMPTY); }}><Icon name="plus" />תור נוסף</button>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHead title="קביעת תור חדש" sub={needsApproval ? 'בחרו סוג הפניה ומועד, מלאו את פרטי המטופל וצרפו מסמכים. הרופא יאשר את התור ותקבלו זימון במייל.' : 'בחרו סוג הפניה ומועד, מלאו את פרטי המטופל וצרפו מסמכים. התור נקבע מיד.'} />
      <form className="wizard" onSubmit={submit} noValidate>
        <div className="step-card">
          <section className="step">
            <div className="step-title"><span className={`step-no${type ? ' done' : ''}`}>{type ? <Icon name="check" size={15} /> : 1}</span><h2>מה צריך מהרופא?</h2></div>
            <div className="options">
              {(Object.keys(TYPES) as ReferralType[]).map((k) => (
                <button key={k} type="button" className="opt" aria-pressed={type === k} onClick={() => setType(k)}>
                  <span className="opt-ic"><Icon name={TYPES[k].icon} /></span>
                  <span><b>{TYPES[k].label}</b><span>{TYPES[k].desc}</span>{Number(prices?.[k]) > 0 && <span className="price">{ils(prices[k])}</span>}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="step">
            <div className="step-title"><span className={`step-no${slot ? ' done' : ''}`}>{slot ? <Icon name="check" size={15} /> : 2}</span><h2>בחירת מועד</h2></div>
            {visible.length === 0 ? (
              <p className="muted">אין כרגע תורים פנויים ב־{horizon} הימים הקרובים. נסו שוב מאוחר יותר או צרו קשר עם המרפאה.</p>
            ) : (
              <>
                <div className="dates" role="listbox" aria-label="ימים פנויים">
                  {visible.map((d) => (
                    <button key={d.date} type="button" className="date" aria-pressed={day === d.date} onClick={() => setDay(d.date)}>
                      <small>{DAYS[weekday(d.date)]}</small>
                      <b className="num">{+d.date.slice(8, 10)}</b>
                      <em>{d.times.length} פנויים</em>
                    </button>
                  ))}
                </div>
                {day && (
                  <>
                    <div className="hint">{fmtDay(day)} · {fmtDate(day)}</div>
                    <div className="times">
                      {dayTimes.map((t) => (
                        <button key={t.iso} type="button" className="time" aria-pressed={slot === t.iso} onClick={() => setSlot(t.iso)}>{t.time}</button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </section>

          <section className="step">
            <div className="step-title"><span className={`step-no${patientOk ? ' done' : ''}`}>{patientOk ? <Icon name="check" size={15} /> : 3}</span><h2>פרטי המטופל</h2></div>
            <div className="grid-2">
              <label className="field" htmlFor="pName"><span>שם מלא</span><input id="pName" autoComplete="off" value={f.name} onChange={set('name')} /></label>
              <label className="field" htmlFor="pId"><span>תעודת זהות</span><input id="pId" inputMode="numeric" dir="ltr" value={f.id} onChange={set('id')} /></label>
              <label className="field" htmlFor="pDob"><span>תאריך לידה</span><input id="pDob" type="date" value={f.dob} onChange={set('dob')} /></label>
              <label className="field" htmlFor="pPhone"><span>טלפון המטופל</span><input id="pPhone" type="tel" dir="ltr" value={f.phone} onChange={set('phone')} /></label>
            </div>
            <label className="field" htmlFor="pEmail"><span>אימייל המטופל <small>לא חובה</small></span>
              <input id="pEmail" type="email" dir="ltr" autoComplete="off" value={f.email} onChange={set('email')} aria-invalid={!emailOk} placeholder="name@example.com" />
            </label>
            <p className={`field-help${emailOk ? '' : ' err'}`}><Icon name="mail" size={15} />{emailOk ? 'כך המטופל יקבל את הזימון ואת המכתב ישירות. אם לא תמלאו, הזימון יישלח אליכם ותעבירו אותו למטופל.' : 'כתובת המייל לא תקינה.'}</p>
          </section>

          <section className="step">
            <div className="step-title"><span className="step-no">4</span><h2>מסמכים והערות לרופא</h2></div>
            <label className="field" htmlFor="notes"><span>מה צריך מהרופא <small>מטרה, רקע, תאריך האירוע, למי המכתב מיועד, שאלות שצריך לענות עליהן</small></span>
              <textarea id="notes" rows={5} value={f.notes} onChange={set('notes')} placeholder="לדוגמה: תאונת עבודה מ־03.2025, נפילה מסולם. תביעה לביטוח לאומי לנכות מעבודה. מבקשים חוות דעת לגבי עמוד שדרה צווארי והקשר לתאונה." />
            </label>
            <FilePicker files={files} onChange={setFiles} />
          </section>
        </div>

        <aside className="panel summary-card">
          <div className="panel-head"><h2><Icon name="receipt" />סיכום</h2></div>
          <div>
            <div className="sum-row"><span>סוג</span><b>{type ? TYPES[type].label : '—'}</b></div>
            <div className="sum-row"><span>מועד</span><b>{chosen ? `${fmtDay(chosen.date)} · ${chosen.time}` : '—'}</b></div>
            <div className="sum-row"><span>מטופל</span><b>{f.name.trim() || '—'}</b></div>
            <div className="sum-row"><span>מסמכים</span><b>{files.length ? `${files.length} קבצים` : 'ללא'}</b></div>
            <div className="sum-row"><span>זימון במייל</span><b>{f.email.trim() && emailOk ? 'למטופל ולכם' : 'אליכם'}</b></div>
            {price > 0 && <div className="sum-row"><span>מחיר (כולל מע״מ)</span><b className="money">{ils(price)}</b></div>}
          </div>
          <div className="stack-sm">
            <span className="hint">מי משלם על התיק?</span>
            <div className="payer">
              {(['referrer', 'patient'] as Payer[]).map((p) => (
                <label key={p}><input type="radio" name="payer" checked={payer === p} onChange={() => setPayer(p)} />{p === 'referrer' ? 'אנחנו (' + PAYERS.referrer + ')' : PAYERS.patient}</label>
              ))}
            </div>
          </div>
          {err && <p className="err" role="alert">{err}</p>}
          {progress != null && <div className="progress"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
          <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>
            {busy ? (progress != null ? `מעלה מסמכים ${Math.round(progress * 100)}%` : 'שומר…') : <><Icon name="check" />{needsApproval ? 'שליחת הבקשה לרופא' : 'קביעת התור'}</>}
          </button>
          <p className="hint">אפשר לבטל או להוסיף מסמכים מתוך התיק.</p>
        </aside>
      </form>
    </>
  );
}
