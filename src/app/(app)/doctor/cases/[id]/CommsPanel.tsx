'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { fmtStamp } from '@/lib/dates';
import { letterReadyText, reminderText, summonsText, waLink, type ApptInfo, type ClinicInfo } from '@/lib/messages';
import { resendSummons, sendLetter, sendLetterExtra } from '../../actions';

export type EmailLogRow = { id: number; kind: string; to_addr: string; status: 'sent' | 'failed' | 'skipped'; error: string; created_at: string };

const KIND: Record<string, string> = {
  new_request: 'התראה לרופא', summons_patient: 'זימון למטופל', summons_firm: 'זימון למפנה', declined: 'דחיית בקשה',
  reminder_patient: 'תזכורת למטופל', reminder_firm: 'תזכורת למפנה', doc_request: 'בקשת מסמכים', firm_update: 'עדכון מהמפנה',
  letter_firm: 'מכתב למפנה', letter_patient: 'מכתב למטופל', letter_awaiting_payment: 'מכתב ממתין לתשלום', letter_extra: 'מכתב למייל נוסף',
};
const STATUS = { sent: 'נשלח', failed: 'נכשל', skipped: 'לא נשלח' };

export default function CommsPanel({ appointmentId, status, info, clinic, patient, firm, letterFinal, letterSentAt, emails, mailOn, preview }: {
  appointmentId: string; status: string; info: ApptInfo; clinic: ClinicInfo;
  patient: { phone: string; email: string }; firm: { phone: string; name: string };
  letterFinal: boolean; letterSentAt: string | null; emails: EmailLogRow[]; mailOn: boolean; preview?: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [extra, setExtra] = useState('');
  const confirmed = status === 'booked' || status === 'draft';
  const run = (fn: () => Promise<{ ok: boolean; error?: string; info?: string }>) => start(async () => {
    if (preview) return setMsg({ ok: true, text: 'תצוגה מקדימה' });
    const r = await fn();
    setMsg(r.ok ? { ok: true, text: r.info || 'נשלח' } : { ok: false, text: r.error || 'השליחה נכשלה' });
    router.refresh();
  });

  return (
    <section className="panel" aria-label="זימונים והודעות">
      <div className="panel-head"><h2><Icon name="send" />זימונים והודעות</h2>{!mailOn && <span className="badge b-draft">מייל לא מוגדר</span>}</div>
      <div className="stack-sm">
        <span className="eyebrow">וואטסאפ · נפתח עם הודעה מוכנה, נשאר רק ללחוץ ״שלח״</span>
        <div className="wa-grid">
          {confirmed && <a className="wa" href={waLink(patient.phone, summonsText(info, clinic))} target="_blank" rel="noopener"><Icon name="message" /><span><b>זימון למטופל</b><small className="ltr">{patient.phone}</small></span></a>}
          {confirmed && <a className="wa" href={waLink(firm.phone || null, summonsText(info, clinic))} target="_blank" rel="noopener"><Icon name="message" /><span><b>זימון למפנה</b><small>{firm.name}</small></span></a>}
          {confirmed && <a className="wa" href={waLink(patient.phone, reminderText(info, clinic))} target="_blank" rel="noopener"><Icon name="clock" /><span><b>תזכורת למטופל</b><small>ליום שלפני</small></span></a>}
          {letterFinal && <a className="wa" href={waLink(firm.phone || null, letterReadyText(info, clinic))} target="_blank" rel="noopener"><Icon name="fileCheck" /><span><b>״המכתב מוכן״ למפנה</b><small>{firm.name}</small></span></a>}
          {!confirmed && !letterFinal && <p className="muted">הכפתורים יופיעו אחרי אישור התור.</p>}
        </div>
      </div>
      <div className="stack-sm">
        <span className="eyebrow">מייל</span>
        <div className="row" style={{ gap: 8 }}>
          {confirmed && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => run(() => resendSummons(appointmentId))}><Icon name="mail" />שליחת הזימון שוב</button>}
          {letterFinal && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => run(() => sendLetter(appointmentId, true))}><Icon name="mail" />{letterSentAt ? 'שליחת המכתב שוב' : 'שליחת המכתב במייל'}</button>}
        </div>
        {letterFinal && (
          <form className="forward" onSubmit={(e) => { e.preventDefault(); if (extra.trim()) run(async () => { const r = await sendLetterExtra(appointmentId, extra); if (r.ok) setExtra(''); return r; }); }}>
            <label className="sr-only" htmlFor="extraMail">שליחת המכתב למייל נוסף</label>
            <input id="extraMail" type="text" dir="ltr" placeholder="מייל נוסף, למשל insurer@example.com" value={extra} onChange={(e) => setExtra(e.target.value)} />
            <button className="btn btn-sm" disabled={busy || !extra.trim()}><Icon name="send" />שליחת המכתב לכתובת הזו</button>
          </form>
        )}
        {msg && <p className={msg.ok ? 'ok-msg' : 'err'} role="status">{msg.text}</p>}
        {emails.length === 0 ? <p className="hint">עוד לא נשלחו מיילים בתיק הזה.</p> : (
          <ul className="mail-log">
            {emails.slice(0, 12).map((e) => (
              <li key={e.id} className={e.status}>
                <span className="dot" aria-hidden="true" />
                <span><b>{KIND[e.kind] || e.kind}</b> <span className="muted ltr">{e.to_addr}</span>{e.status !== 'sent' && e.error && <small className="err-s">{e.error}</small>}</span>
                <span className="hint">{STATUS[e.status]} · {fmtStamp(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
