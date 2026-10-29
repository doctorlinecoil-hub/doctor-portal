'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase/browser';
import { dbError } from '@/lib/constants';
import { DAYS, fmtDate, fmtDay, ilParts, weekday } from '@/lib/dates';
import type { DaySlots } from '@/lib/slots';
import { afterBooking } from '../actions';
import Icon from '@/components/Icon';
import { PageHead } from '@/components/ui';

/** Stage 1 of a referral: pick a time. Documents and details come right after, on the case itself. */
export default function SlotBooking({ firmId, slots, horizon, clinicName, needsApproval, preview }: {
  firmId: string; slots: DaySlots[]; horizon: number; clinicName: string; needsApproval: boolean; preview?: boolean;
}) {
  const supabase = useSupabase();
  const router = useRouter();
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const visible = useMemo(
    () => slots.map((d) => ({ ...d, times: d.times.filter((t) => !taken.has(t.iso)) })).filter((d) => d.times.length),
    [slots, taken],
  );
  const [day, setDay] = useState<string | null>(visible[0]?.date ?? null);
  const [slot, setSlot] = useState<string | null>(preview ? visible[0]?.times[1]?.iso ?? null : null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const dayTimes = visible.find((d) => d.date === day)?.times ?? [];
  const chosen = slot ? ilParts(slot) : null;

  async function book() {
    if (!slot) return setErr('בחרו מועד.');
    if (preview) return setErr('זו תצוגה מקדימה.');
    setBusy(true);
    setErr('');
    const { data, error } = await supabase.from('appointments').insert({ firm_id: firmId, starts_at: slot }).select('id').single();
    if (error || !data) {
      if (error?.code === '23505' || error?.code === '23P01') { setTaken(new Set([...taken, slot])); setSlot(null); }
      setErr(dbError(error));
      setBusy(false);
      return;
    }
    await afterBooking(data.id).catch(() => undefined);
    router.push(`/firm/cases/${data.id}/details`);
  }

  return (
    <>
      <PageHead title="קביעת תור חדש" sub={`${clinicName} · בוחרים מועד, ומיד אחר כך מעלים מסמכים. את פרטי המטופל המערכת קוראת מהמסמכים.`} />
      <Stepper at={1} />
      <section className="panel book-slot">
        <div className="panel-head"><h2><Icon name="calendar" />בחירת מועד</h2>{needsApproval && <span className="hint">התור יאושר על ידי הרופא</span>}</div>
        {visible.length === 0 ? (
          <p className="muted">אין כרגע תורים פנויים ב־{horizon} הימים הקרובים. נסו שוב מאוחר יותר או צרו קשר עם המרפאה.</p>
        ) : (
          <>
            <div className="dates" role="listbox" aria-label="ימים פנויים">
              {visible.map((d) => (
                <button key={d.date} type="button" className="date" aria-pressed={day === d.date} onClick={() => { setDay(d.date); setSlot(null); }}>
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
      <div className="book-bar">
        <div className="book-bar-text">
          {chosen ? <><Icon name="calendar" /><span><b>{fmtDay(chosen.date)} · {fmtDate(chosen.date)} · {chosen.time}</b><small>בשלב הבא: העלאת מסמכים</small></span></> : <span className="hint">בחרו יום ושעה</span>}
        </div>
        {err && <p className="err" role="alert">{err}</p>}
        <button type="button" className="btn btn-primary btn-lg" disabled={!slot || busy} onClick={book}>
          {busy ? 'שומר את התור…' : <>קביעת התור והמשך<Icon name="arrowLeft" /></>}
        </button>
      </div>
    </>
  );
}

/** The three stages of a referral, shown on top of each stage. */
export function Stepper({ at }: { at: 1 | 2 | 3 | 4 }) {
  const steps = ['מועד', 'מסמכים', 'פרטים ואישור'];
  return (
    <ol className="stepper" aria-label="שלבי ההפניה">
      {steps.map((s, i) => {
        const n = i + 1;
        const state = n < at ? 'done' : n === at ? 'now' : '';
        return (
          <li key={s} className={state} aria-current={n === at ? 'step' : undefined}>
            <span className="stepper-n">{n < at ? <Icon name="check" size={14} /> : n}</span>
            <span>{s}</span>
          </li>
        );
      })}
    </ol>
  );
}
