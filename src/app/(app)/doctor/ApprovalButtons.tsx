'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { approveRequest, declineRequest } from './actions';

const REASONS = ['המועד לא מתאים, נא לבחור מועד אחר', 'הבקשה לא בתחום המומחיות של הרופא', 'חסרים מסמכים לפני קביעת התור'];

/** Approve or decline a referrer's request. */
export default function ApprovalButtons({ id, compact, preview }: { id: string; compact?: boolean; preview?: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const approve = () => start(async () => {
    if (preview) return setMsg({ ok: true, text: 'תצוגה מקדימה' });
    const r = await approveRequest(id);
    setMsg(r.ok ? { ok: true, text: r.info || 'אושר' } : { ok: false, text: r.error || 'נכשל' });
    router.refresh();
  });
  const decline = () => start(async () => {
    if (preview) return setMsg({ ok: true, text: 'תצוגה מקדימה' });
    const r = await declineRequest(id, reason);
    setMsg(r.ok ? { ok: true, text: r.info || 'נדחה' } : { ok: false, text: r.error || 'נכשל' });
    setDeclining(false);
    router.refresh();
  });

  if (msg?.ok && !compact) return <p className="ok-msg" role="status"><Icon name="checkCircle" size={16} /> {msg.text}</p>;
  return (
    <div className={`approve${compact ? ' compact' : ''}`}>
      {!declining ? (
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-ok" onClick={approve} disabled={busy}><Icon name="check" />{busy ? 'מאשר…' : compact ? 'אישור' : 'אישור התור ושליחת זימון'}</button>
          <button type="button" className="btn btn-ghost" onClick={() => setDeclining(true)} disabled={busy}>{compact ? 'דחייה' : 'דחיית הבקשה'}</button>
        </div>
      ) : (
        <div className="stack-sm decline-box">
          <div className="chips">{REASONS.map((r) => <button type="button" key={r} className={`chip-btn${reason === r ? ' on' : ''}`} onClick={() => setReason(r)}>{r}</button>)}</div>
          <input aria-label="סיבת הדחייה" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="סיבה קצרה שהמפנה יראה" maxLength={500} />
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-danger" onClick={decline} disabled={busy}>{busy ? 'שולח…' : 'דחייה ועדכון המפנה'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setDeclining(false)}>חזרה</button>
          </div>
        </div>
      )}
      {msg && <p className={msg.ok ? 'ok-msg' : 'err'} role="status">{msg.text}</p>}
    </div>
  );
}
