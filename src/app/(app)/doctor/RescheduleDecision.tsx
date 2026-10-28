'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { decideReschedule } from './actions';

export type RescheduleRow = { id: string; appointment_id: string; requested_starts_at: string; reason: string; created_at: string };

/** Approve or decline a reschedule request (case page and dashboard). */
export default function RescheduleDecision({ req, fromLabel, toLabel, compact, preview }: { req: RescheduleRow; fromLabel: string; toLabel: string; compact?: boolean; preview?: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [declining, setDeclining] = useState(false);
  const [why, setWhy] = useState('');
  const run = (approve: boolean) => start(async () => {
    if (preview) return setMsg({ ok: true, text: 'תצוגה מקדימה' });
    const r = await decideReschedule(req.id, req.appointment_id, approve, why);
    setMsg(r.ok ? { ok: true, text: r.info || '' } : { ok: false, text: r.error || 'נכשל' });
    router.refresh();
  });
  return (
    <section className={`resched${compact ? ' compact' : ''}`}>
      <div className="resched-text">
        <span className="request-ic"><Icon name="calendar" /></span>
        <div>
          <b>בקשה לשינוי מועד</b>
          <span><s>{fromLabel}</s> ← <b>{toLabel}</b></span>
          {req.reason && <span className="hint">״{req.reason}״</span>}
        </div>
      </div>
      {msg?.ok ? <p className="ok-msg">{msg.text}</p> : !declining ? (
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-ok" disabled={busy} onClick={() => run(true)}><Icon name="check" />{busy ? '…' : 'אישור המועד החדש'}</button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setDeclining(true)}>דחייה</button>
        </div>
      ) : (
        <div className="row" style={{ gap: 8 }}>
          <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="סיבה קצרה (לא חובה)" aria-label="סיבת הדחייה" />
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => run(false)}>דחייה</button>
          <button type="button" className="btn btn-ghost" onClick={() => setDeclining(false)}>חזרה</button>
        </div>
      )}
      {msg && !msg.ok && <p className="err">{msg.text}</p>}
    </section>
  );
}
