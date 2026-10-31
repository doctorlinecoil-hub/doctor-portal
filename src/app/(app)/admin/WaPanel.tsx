'use client';
import { useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import { waTemplates } from './actions';

/** WhatsApp: connection state and the message templates Meta has to approve. */
export default function WaPanel({ connected }: { connected: boolean }) {
  const [rows, setRows] = useState<{ name: string; title: string; status: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async (submit: boolean) => {
    setBusy(true); setErr('');
    const r = await waTemplates(submit).catch(() => ({ ok: false, error: 'הפעולה נכשלה' } as { ok: boolean; error?: string; rows?: { name: string; title: string; status: string }[] }));
    setBusy(false);
    if (!r.ok) return setErr(r.error || 'הפעולה נכשלה');
    setRows(r.rows ?? []);
  };
  useEffect(() => { if (connected) run(false); }, [connected]);
  if (!connected) {
    return <div className="callout info"><div><Icon name="message" />וואטסאפ עוד לא מחובר. אחרי שמוסיפים ב־Vercel את WHATSAPP_TOKEN, WHATSAPP_PHONE_ID ו־WHATSAPP_WABA_ID, כאן יופיע מצב הנוסחים.</div></div>;
  }
  return (
    <div className="wa-tpl">
      <div className="wa-tpl-head">
        <b>נוסחי ההודעות האוטומטיות</b>
        <small>מטא מאשרת כל נוסח פעם אחת (בדרך כלל תוך דקות עד שעות). עד שנוסח מאושר, ההודעה מהסוג הזה לא נשלחת בוואטסאפ.</small>
      </div>
      {rows && (
        <ul>
          {rows.map((r) => <li key={r.name}><span>{r.title}</span><em className={r.status.startsWith('מאושר') ? 'ok' : ''}>{r.status}</em></li>)}
        </ul>
      )}
      <div className="row">
        <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => run(true)}>{busy ? 'שולח…' : 'שליחת הנוסחים לאישור מטא'}</button>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => run(false)}>רענון מצב</button>
      </div>
      {err && <span className="err">{err}</span>}
    </div>
  );
}
