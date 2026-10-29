'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { KIND, type ReferrerKind } from '@/lib/constants';
import { fmtStamp } from '@/lib/dates';
import Icon from '@/components/Icon';
import { approveRegistration, rejectRegistration } from '../actions';

export type Pending = {
  id: string; name: string; kind: ReferrerKind; contact_name: string; phone: string; email: string; active: boolean;
  self_registered?: boolean; approved_at?: string | null; license_no?: string; signup_note?: string; created_at?: string;
};

/** New accounts that people opened by themselves, waiting for the clinic. */
export default function PendingSignups({ list, preview }: { list: Pending[]; preview?: boolean }) {
  if (!list.length) return null;
  return (
    <section className="panel signups" id="pending">
      <div className="panel-head"><h2><Icon name="inbox" />הרשמות שממתינות לאישור</h2><span className="badge b-pending">{list.length}</span></div>
      <div className="signup-list">{list.map((f) => <Row key={f.id} f={f} preview={preview} />)}</div>
    </section>
  );
}

function Row({ f, preview }: { f: Pending; preview?: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const act = (fn: () => Promise<{ ok: boolean; error?: string; info?: string }>) => start(async () => {
    if (preview) return setMsg({ ok: true, text: 'תצוגה מקדימה' });
    const r = await fn();
    setMsg(r.ok ? { ok: true, text: r.info || 'בוצע' } : { ok: false, text: r.error || 'נכשל' });
    if (r.ok) router.refresh();
  });
  const patient = f.kind === 'patient';
  return (
    <div className="signup">
      <span className={`signup-ic${patient ? ' pt' : ''}`}><Icon name={patient ? 'user' : f.kind === 'law' ? 'scale' : f.kind === 'company' ? 'building' : 'handshake'} /></span>
      <div className="signup-body">
        <div className="signup-top"><b>{f.name}</b><span className="badge b-type">{KIND[f.kind] || f.kind}</span>{f.created_at && <span className="hint">{fmtStamp(f.created_at)}</span>}</div>
        <div className="signup-meta">
          {!patient && <span><Icon name="user" size={13} />{f.contact_name}</span>}
          <span dir="ltr"><Icon name="mail" size={13} />{f.email}</span>
          <span dir="ltr"><Icon name="phone" size={13} />{f.phone}</span>
          {f.license_no && <span><Icon name="idcard" size={13} />רישיון {f.license_no}</span>}
        </div>
        {f.signup_note && <div className="hint">{f.signup_note}</div>}
        {msg && <p className={msg.ok ? 'ok-msg' : 'err'}>{msg.text}</p>}
        {rejecting && (
          <div className="row" style={{ gap: 8, marginTop: 6 }}>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="סיבה (תישלח במייל, לא חובה)" maxLength={300} aria-label="סיבת הדחייה" style={{ flex: 1 }} />
            <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => act(() => rejectRegistration(f.id, reason))}>דחייה</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRejecting(false)}>חזרה</button>
          </div>
        )}
      </div>
      {!rejecting && !msg?.ok && (
        <div className="signup-act">
          <button type="button" className="btn btn-ok btn-sm" disabled={busy} onClick={() => act(() => approveRegistration(f.id))}><Icon name="check" size={15} />{busy ? 'מאשר…' : 'אישור'}</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setRejecting(true)}>דחייה</button>
        </div>
      )}
    </div>
  );
}
