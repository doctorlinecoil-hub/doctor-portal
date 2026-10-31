'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { ils } from '@/lib/constants';
import { approveRequest, approveWithDeposit, declineRequest } from './actions';

export type DepositState = { amount: number; paid: boolean; proof: boolean };

const REASONS = ['המועד לא מתאים, נא לבחור מועד אחר', 'הבקשה לא בתחום המומחיות של הרופא', 'חסרים מסמכים לפני קביעת התור'];

/** Approve or decline a referrer's request. */
export default function ApprovalButtons({ id, compact, preview, deposit }: { id: string; compact?: boolean; preview?: boolean; deposit?: DepositState | null }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [wa, setWa] = useState<string | null>(null);
  const [method, setMethod] = useState<'transfer' | 'bit' | 'cash' | 'card'>('transfer');
  const needsDeposit = !!deposit && deposit.amount > 0 && !deposit.paid;

  const approve = () => start(async () => {
    if (preview) return setMsg({ ok: true, text: 'תצוגה מקדימה' });
    const r = await approveRequest(id);
    setMsg(r.ok ? { ok: true, text: r.info || 'אושר' } : { ok: false, text: r.error || 'נכשל' });
    if (r.ok) setWa(r.wa ?? null);
    router.refresh();
  });
  const approveDep = () => start(async () => {
    if (preview) return setMsg({ ok: true, text: 'תצוגה מקדימה' });
    const r = await approveWithDeposit(id, method, deposit!.amount);
    setMsg(r.ok ? { ok: true, text: r.info || 'אושר' } : { ok: false, text: r.error || 'נכשל' });
    if (r.ok) setWa(r.wa ?? null);
    router.refresh();
  });
  const decline = () => start(async () => {
    if (preview) return setMsg({ ok: true, text: 'תצוגה מקדימה' });
    const r = await declineRequest(id, reason);
    setMsg(r.ok ? { ok: true, text: r.info || 'נדחה' } : { ok: false, text: r.error || 'נכשל' });
    setDeclining(false);
    router.refresh();
  });

  const waBtn = wa ? <a className="btn btn-wa" href={wa} target="_blank" rel="noopener"><Icon name="message" size={16} />שליחת הזימון בוואטסאפ</a> : null;
  if (msg?.ok && (!compact || waBtn)) return <div className="approve-done"><p className="ok-msg" role="status"><Icon name="checkCircle" size={16} /> {msg.text}</p>{waBtn}</div>;
  return (
    <div className={`approve${compact ? ' compact' : ''}`}>
      {!declining ? (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {needsDeposit && (
            <span className={`dep-chip${deposit!.proof ? ' ok' : ''}`} title={deposit!.proof ? 'המטופל העלה אישור העברה (במסמכי התיק)' : 'המקדמה עוד לא התקבלה'}>
              <Icon name={deposit!.proof ? 'fileCheck' : 'clock'} size={14} />{deposit!.proof ? 'נשלח אישור העברה' : 'ממתין למקדמה'} · {ils(deposit!.amount)}
            </span>
          )}
          {needsDeposit ? (
            <>
              <select aria-label="איך שולמה המקדמה" value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className="dep-method">
                <option value="transfer">העברה</option><option value="bit">ביט</option><option value="cash">מזומן</option><option value="card">אשראי</option>
              </select>
              <button type="button" className="btn btn-ok" onClick={approveDep} disabled={busy}><Icon name="check" />{busy ? 'מאשר…' : compact ? 'המקדמה התקבלה · אישור' : 'המקדמה התקבלה · אישור התור ושליחת זימון'}</button>
            </>
          ) : (
            <button type="button" className="btn btn-ok" onClick={approve} disabled={busy}><Icon name="check" />{busy ? 'מאשר…' : compact ? 'אישור' : 'אישור התור ושליחת זימון'}</button>
          )}
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
