'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { discardDraft } from '../../actions';

/** A document opened without an appointment: it is not counted until issued, and can be dropped. */
export default function DiscardDraft({ appointmentId, banner = true }: { appointmentId: string; banner?: boolean }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const btn = (
    <button type="button" className={`btn btn-sm btn-danger${armed ? ' armed' : ''}`} disabled={busy}
      onClick={async () => {
        if (!armed) return setArmed(true);
        setBusy(true);
        const r = await discardDraft(appointmentId).catch(() => ({ ok: false, error: 'הפעולה נכשלה. נסו שוב.' }));
        setBusy(false); setArmed(false);
        if (!r.ok) return setErr(r.error || 'הפעולה נכשלה');
        router.push('/doctor');
        router.refresh();
      }}>
      {busy ? 'מוחק…' : armed ? 'לחצו שוב למחיקה' : 'לא מכין – מחיקה'}
    </button>
  );
  if (!banner) return <span className="row">{btn}{err && <span className="err">{err}</span>}</span>;
  return (
    <div className="pv-banner" role="status">
      <div>
        <b>טיוטה – עדיין לא נרשמה במערכת</b>
        <small>המסמך ייספר רק אחרי ״תצוגה לפני שליחה״ (מכתב) או שמירת המרשם. אם החלטת לא להכין – אפשר למחוק.</small>
      </div>
      {btn}
      {err && <span className="err">{err}</span>}
    </div>
  );
}
