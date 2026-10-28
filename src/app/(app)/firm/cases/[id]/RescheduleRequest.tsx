'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase/browser';
import { dbError } from '@/lib/constants';
import { DAYS, fmtDate, ilParts, weekday } from '@/lib/dates';
import type { DaySlots } from '@/lib/slots';
import Icon from '@/components/Icon';

export type MyReschedule = { status: 'pending' | 'approved' | 'declined'; requested_starts_at: string; response: string; created_at: string } | null;

const label = (iso: string) => { const p = ilParts(iso); return `יום ${DAYS[weekday(p.date)]} ${fmtDate(p.date)} ${p.time}`; };

/** The referrer asks to move an appointment: picks a free slot, the doctor approves. */
export default function RescheduleRequest({ appointmentId, firmId, slots, last, preview }: { appointmentId: string; firmId: string; slots: DaySlots[]; last: MyReschedule; preview?: boolean }) {
  const supabase = useSupabase();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(slots[0]?.date ?? '');
  const [slot, setSlot] = useState('');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();

  if (last?.status === 'pending') {
    return (
      <section className="panel">
        <div className="panel-head"><h2><Icon name="calendar" />שינוי מועד</h2><span className="badge b-pending">ממתין לאישור הרופא</span></div>
        <p>ביקשתם להעביר את התור ל־<b>{label(last.requested_starts_at)}</b>. תקבלו הודעה וזימון מעודכן מיד אחרי האישור.</p>
      </section>
    );
  }
  const send = () => start(async () => {
    if (!slot) return setMsg({ ok: false, text: 'בחרו מועד חדש.' });
    if (preview) return setMsg({ ok: true, text: 'תצוגה מקדימה' });
    const { error } = await supabase.from('reschedule_requests').insert({ appointment_id: appointmentId, firm_id: firmId, requested_starts_at: slot, reason: reason.trim().slice(0, 500) });
    if (error) return setMsg({ ok: false, text: dbError(error) });
    setMsg({ ok: true, text: 'הבקשה נשלחה לרופא' });
    setOpen(false);
    router.refresh();
  });
  const times = slots.find((d) => d.date === day)?.times ?? [];
  return (
    <section className="panel">
      <div className="panel-head"><h2><Icon name="calendar" />שינוי מועד</h2></div>
      {last?.status === 'declined' && <div className="callout bad"><div><Icon name="x" />הבקשה הקודמת לשינוי מועד לא אושרה{last.response ? `: ${last.response}` : ''}.</div></div>}
      {!open ? (
        <div className="row"><button type="button" className="btn" onClick={() => setOpen(true)}><Icon name="calendar" />בקשה להעביר את התור</button>
          <span className="hint">בוחרים מועד פנוי, והרופא מאשר בלחיצה.</span></div>
      ) : slots.length === 0 ? <p className="muted">אין כרגע מועדים פנויים.</p> : (
        <div className="stack-sm">
          <div className="dates" role="listbox" aria-label="ימים פנויים">
            {slots.map((d) => (
              <button key={d.date} type="button" className="date" aria-pressed={day === d.date} onClick={() => { setDay(d.date); setSlot(''); }}>
                <small>{DAYS[weekday(d.date)]}</small><b className="num">{+d.date.slice(8, 10)}</b><em>{d.times.length} פנויים</em>
              </button>
            ))}
          </div>
          <div className="times">{times.map((t) => <button key={t.iso} type="button" className="time" aria-pressed={slot === t.iso} onClick={() => setSlot(t.iso)}>{t.time}</button>)}</div>
          <label className="field"><span>סיבה <small>לא חובה</small></span><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="המטופל לא יכול להגיע" /></label>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={send} disabled={busy || !slot}><Icon name="send" />{busy ? 'שולח…' : slot ? `בקשה להעביר ל־${label(slot)}` : 'בחרו מועד'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>ביטול</button>
          </div>
        </div>
      )}
      {msg && <p className={msg.ok ? 'ok-msg' : 'err'}>{msg.text}</p>}
    </section>
  );
}
