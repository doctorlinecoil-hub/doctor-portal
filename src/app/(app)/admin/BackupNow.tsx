'use client';
import { useState, useTransition } from 'react';
import Icon from '@/components/Icon';
import { backupNow } from './actions';

/** The daily backup goes out by itself at night; this sends one now. */
export default function BackupNow() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  return (
    <section className="panel">
      <div className="panel-head"><h2><Icon name="shield" />גיבוי יומי במייל</h2></div>
      <p className="muted">
        בכל ערב בשעה 21:00 נשלח למייל של מנהל המערכת ולכתובות ההתראות של הרופא גיבוי מלא: רשימת כל התיקים (נפתחת באקסל) וקובץ עם כל הנתונים לשחזור.
        המסמכים שהועלו שמורים בנפרד באחסון המאובטח.
      </p>
      <div className="row">
        <button type="button" className="btn" disabled={pending} onClick={() => start(async () => {
          const r = await backupNow();
          setMsg({ ok: r.ok, t: r.ok ? r.info || 'הגיבוי נשלח' : r.error || 'השליחה נכשלה' });
        })}><Icon name="mail" />{pending ? 'שולח…' : 'שליחת גיבוי עכשיו'}</button>
      </div>
      {msg && <p className={msg.ok ? 'ok-msg' : 'err'} role="status">{msg.t}</p>}
    </section>
  );
}
