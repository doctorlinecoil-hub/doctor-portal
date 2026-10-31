'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DAYS, fmtDate, ilParts, ilToUtc, todayIL, weekday } from '@/lib/dates';
import { moveAppointment } from '../../actions';

/** The doctor moves the appointment to another time; the patient and the referrer get an update by email. */
export default function MoveAppointment({ appointmentId, startsAt, pending }: { appointmentId: string; startsAt: string; pending: boolean }) {
  const router = useRouter();
  const cur = ilParts(startsAt);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(cur.date);
  const [time, setTime] = useState(cur.time);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [wa, setWa] = useState<string | null>(null);

  if (!open) {
    return (
      <div className="row">
        <button type="button" className="btn btn-sm" onClick={() => { setOpen(true); setMsg(null); }}>הזזת התור למועד אחר</button>
        {msg && <span className={msg.ok ? 'ok-msg' : 'err'}>{msg.text}</span>}
        {wa && <a className="btn btn-sm btn-wa" href={wa} target="_blank" rel="noopener">עדכון המטופל בוואטסאפ</a>}
      </div>
    );
  }
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time);
  const same = date === cur.date && time === cur.time;
  return (
    <div className="mv-box">
      <b>הזזת התור</b>
      <small>כרגע: יום {DAYS[weekday(cur.date)]} {fmtDate(cur.date)} · {cur.time}</small>
      <div className="mv-row">
        <label className="field"><span>תאריך חדש</span><input type="date" dir="ltr" value={date} min={todayIL()} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field"><span>שעה</span><input type="time" dir="ltr" step={300} value={time} onChange={(e) => setTime(e.target.value)} /></label>
      </div>
      {!pending && (
        <label className="mv-check"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />לשלוח למטופל ולמפנה מייל עדכון עם קובץ ליומן</label>
      )}
      <div className="row">
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={busy || !valid || same}
          onClick={async () => {
            setBusy(true);
            const r = await moveAppointment(appointmentId, ilToUtc(date, time).toISOString(), notify).catch(() => ({ ok: false, error: 'הפעולה נכשלה. נסו שוב.' }) as { ok: boolean; error?: string; info?: string; wa?: string | null });
            setBusy(false);
            if (!r.ok) return setMsg({ ok: false, text: r.error || 'הפעולה נכשלה' });
            setOpen(false);
            setMsg({ ok: true, text: r.info || 'המועד עודכן' });
            setWa(r.wa ?? null);
            router.refresh();
          }}
        >
          {busy ? 'מעדכן…' : 'עדכון המועד'}
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>ביטול</button>
      </div>
      {msg && !msg.ok && <span className="err">{msg.text}</span>}
    </div>
  );
}
