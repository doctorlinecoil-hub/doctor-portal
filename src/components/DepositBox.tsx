'use client';
import { useState } from 'react';
import { ils } from '@/lib/constants';
import { checkFile } from '@/lib/upload';
import Icon from './Icon';

export type PayInfo = { bank: string[]; bit: string; note: string };

/** How to pay (bank transfer / Bit), with copy buttons, and an upload for the transfer confirmation. */
export default function DepositBox({ amount, title, lead, pay, holdHours, sent, upload }: {
  amount: number; title: string; lead?: React.ReactNode; pay: PayInfo; holdHours?: number; sent?: boolean;
  upload?: (f: File) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>(sent ? 'done' : 'idle');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState('');
  const copy = (t: string) => { navigator.clipboard?.writeText(t).then(() => { setCopied(t); setTimeout(() => setCopied(''), 1500); }).catch(() => undefined); };
  const has = pay.bank.length > 0 || !!pay.bit;

  async function pick(list: FileList | null) {
    const f = list?.[0];
    if (!f || !upload) return;
    const e = checkFile(f);
    if (e) return setErr(e);
    setErr('');
    setState('busy');
    const r = await upload(f).catch(() => ({ ok: false, error: 'אין חיבור. נסו שוב.' }));
    if (r.ok) setState('done');
    else { setState('idle'); setErr(r.error || 'ההעלאה נכשלה.'); }
  }

  return (
    <section className="dep">
      <div className="dep-head">
        <span className="dep-ic"><Icon name="wallet" /></span>
        <div><b>{title}</b>{lead ? <div className="dep-lead">{lead}</div> : null}</div>
        <span className="dep-amount">{ils(amount)}</span>
      </div>
      {has ? (
        <div className="dep-ways">
          {pay.bank.length > 0 && (
            <div className="dep-way">
              <span className="dep-label"><Icon name="building" size={15} />העברה בנקאית</span>
              {pay.bank.map((l) => (
                <div key={l} className="dep-line"><span>{l}</span><button type="button" className="icon-btn" onClick={() => copy(l.replace(/^[^:]*:\s*/, ''))} aria-label={`העתקה: ${l}`}>{copied === l.replace(/^[^:]*:\s*/, '') ? <Icon name="check" size={14} /> : <Icon name="file" size={14} />}</button></div>
              ))}
            </div>
          )}
          {pay.bit && (
            <div className="dep-way">
              <span className="dep-label"><Icon name="phone" size={15} />ביט / פייבוקס</span>
              <div className="dep-line"><span dir="ltr">{pay.bit}</span><button type="button" className="icon-btn" onClick={() => copy(pay.bit)} aria-label="העתקת המספר">{copied === pay.bit ? <Icon name="check" size={14} /> : <Icon name="file" size={14} />}</button></div>
            </div>
          )}
        </div>
      ) : <p className="muted">פרטי התשלום יישלחו אליכם מהמרפאה.</p>}
      {pay.note && <p className="dep-note">{pay.note}</p>}
      {upload && (
        state === 'done'
          ? <div className="dep-sent"><Icon name="checkCircle" />אישור ההעברה התקבל. הרופא יאשר את התור ויישלח אליכם זימון.</div>
          : (
            <label className={`btn ${state === 'busy' ? '' : 'btn-primary'} dep-up`}>
              <input type="file" hidden accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => { pick(e.target.files); e.target.value = ''; }} disabled={state === 'busy'} />
              <Icon name="upload" />{state === 'busy' ? 'מעלה…' : 'העלאת צילום של אישור ההעברה'}
            </label>
          )
      )}
      {err && <p className="err">{err}</p>}
      {holdHours ? <p className="hint">אם המקדמה לא תתקבל בתוך {holdHours} שעות, הבקשה תבוטל והמועד ישוחרר.</p> : null}
    </section>
  );
}
