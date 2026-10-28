'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { PayBadge } from '@/components/Badges';
import { PAYERS, PAY_METHODS, ils, payState, type Payer, type PayMethod } from '@/lib/constants';
import { fmtDate, todayIL } from '@/lib/dates';
import type { PaymentRow } from '@/lib/types';
import { deletePayment, issueInvoice, recordPayment, updateBilling } from '../../../admin/actions';

type Props = { appointmentId: string; price: number; payer: Payer; paid: number; payments: PaymentRow[]; morning: boolean; payerName: string; preview?: boolean };

export default function PaymentPanel({ appointmentId, price, payer, paid, payments, morning, payerName, preview }: Props) {
  const router = useRouter();
  const [bill, setBill] = useState({ price: String(price), payer });
  const [open, setOpen] = useState(false);
  const balance = Math.max(0, price - paid);
  const [f, setF] = useState({ amount: String(balance || ''), method: 'transfer' as PayMethod, paidOn: todayIL(), receiptNo: '', receiptUrl: '', note: '', issue: morning, send: true, chequeNum: '', bankName: '', bankBranch: '', bankAccount: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const dirty = bill.price !== String(price) || bill.payer !== payer;
  const pct = price > 0 ? Math.min(100, Math.round((paid / price) * 100)) : 0;

  async function run(fn: () => Promise<{ ok: boolean; error?: string; info?: string }>, after?: () => void) {
    if (preview) return setMsg({ ok: false, text: 'זו תצוגה מקדימה. במערכת האמיתית הפעולה נשמרת.' });
    setBusy(true);
    setMsg(null);
    const r = await fn();
    setBusy(false);
    setArmed(null);
    setMsg({ ok: r.ok && !r.info?.includes('לא הופקה'), text: r.ok ? r.info || 'נשמר' : r.error || 'הפעולה נכשלה' });
    if (r.ok) { after?.(); router.refresh(); }
  }

  return (
    <section className="panel" id="payment">
      <div className="panel-head"><h2><Icon name="wallet" />תשלום</h2><PayBadge state={payState(price, paid)} /></div>
      <div className="pay-grid">
        <div><span>מחיר</span><b>{ils(price)}</b></div>
        <div><span>שולם</span><b>{ils(paid)}</b></div>
        <div><span>יתרה</span><b>{ils(balance)}</b></div>
      </div>
      {price > 0 && <div className="pay-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>}

      <div className="grid-2" style={{ alignItems: 'end' }}>
        <label className="field" htmlFor="bPrice"><span>מחיר כולל מע״מ</span><input id="bPrice" inputMode="decimal" dir="ltr" value={bill.price} onChange={(e) => setBill({ ...bill, price: e.target.value })} /></label>
        <label className="field" htmlFor="bPayer"><span>מי משלם</span>
          <select id="bPayer" value={bill.payer} onChange={(e) => setBill({ ...bill, payer: e.target.value as Payer })}>
            <option value="referrer">{PAYERS.referrer}</option><option value="patient">{PAYERS.patient}</option>
          </select>
        </label>
      </div>
      <div className="hint">החשבונית תצא על שם: <b>{payerName}</b></div>
      {dirty && <div className="row"><button type="button" className="btn btn-soft btn-sm" disabled={busy} onClick={() => run(() => updateBilling(appointmentId, { price: Number(bill.price), payer: bill.payer }))}><Icon name="save" />שמירת מחיר ומשלם</button></div>}

      {payments.length > 0 && (
        <div>
          {payments.map((p) => (
            <div className="pay-line" key={p.id}>
              <span className="stack-sm" style={{ gap: 2 }}>
                <span><b className="money">{ils(p.amount)}</b> <span className="muted">· {PAY_METHODS[p.method]} · {fmtDate(p.paid_on)}</span></span>
                {p.note && <span className="hint">{p.note}</span>}
                {p.invoice_error && <span className="err" style={{ fontSize: 13 }}>{p.invoice_error}</span>}
              </span>
              <span className="row" style={{ gap: 6 }}>
                {p.receipt_url ? <a className="btn btn-sm" href={p.receipt_url} target="_blank" rel="noopener"><Icon name="receipt" />{p.receipt_no}</a>
                  : p.receipt_no ? <span className="hint">קבלה {p.receipt_no}</span>
                  : morning ? <button type="button" className="btn btn-sm btn-soft" disabled={busy} onClick={() => run(() => issueInvoice(p.id!, true))}><Icon name="receipt" />הפקת חשבונית</button> : null}
                <button type="button" className={`btn btn-sm btn-ghost${armed === p.id ? ' armed' : ''}`} aria-label="מחיקת התשלום" disabled={busy}
                  onClick={() => (armed === p.id ? run(() => deletePayment(p.id!)) : setArmed(p.id!))}>{armed === p.id ? 'למחוק?' : <Icon name="trash" />}</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {!open ? (
        <button type="button" className="btn btn-primary" onClick={() => { setOpen(true); setF({ ...f, amount: String(balance || '') }); }}><Icon name="plus" />רישום תשלום</button>
      ) : (
        <div className="stack" style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
          <div className="grid-3">
            <label className="field" htmlFor="pAmount"><span>סכום ₪</span><input id="pAmount" inputMode="decimal" dir="ltr" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
            <label className="field" htmlFor="pMethod"><span>אמצעי תשלום</span>
              <select id="pMethod" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as PayMethod })}>
                {(Object.keys(PAY_METHODS) as PayMethod[]).map((m) => <option key={m} value={m}>{PAY_METHODS[m]}</option>)}
              </select>
            </label>
            <label className="field" htmlFor="pDate"><span>תאריך</span><input id="pDate" type="date" value={f.paidOn} onChange={(e) => setF({ ...f, paidOn: e.target.value })} /></label>
          </div>
          {morning ? (
            <>
              <label className="check"><input type="checkbox" checked={f.issue} onChange={(e) => setF({ ...f, issue: e.target.checked })} /><span>הפקת חשבונית מס / קבלה במורנינג<small>החשבונית נוצרת אוטומטית ומקושרת לתיק</small></span></label>
              {f.issue && <label className="check"><input type="checkbox" checked={f.send} onChange={(e) => setF({ ...f, send: e.target.checked })} /><span>שליחת החשבונית במייל ללקוח</span></label>}
            </>
          ) : null}
          {(!morning || !f.issue) && (
            <div className="grid-2">
              <label className="field" htmlFor="pRec"><span>מספר קבלה <small>(אם הופקה בנפרד)</small></span><input id="pRec" dir="ltr" value={f.receiptNo} onChange={(e) => setF({ ...f, receiptNo: e.target.value })} /></label>
              <label className="field" htmlFor="pRecUrl"><span>קישור לקבלה <small>(לא חובה)</small></span><input id="pRecUrl" dir="ltr" placeholder="https://" value={f.receiptUrl} onChange={(e) => setF({ ...f, receiptUrl: e.target.value })} /></label>
            </div>
          )}
          {morning && f.issue && f.method === 'check' && (
            <div className="grid-2">
              <label className="field" htmlFor="cNum"><span>מספר צ׳ק</span><input id="cNum" dir="ltr" value={f.chequeNum} onChange={(e) => setF({ ...f, chequeNum: e.target.value })} /></label>
              <label className="field" htmlFor="cBank"><span>בנק</span><input id="cBank" value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })} /></label>
              <label className="field" htmlFor="cBranch"><span>סניף</span><input id="cBranch" dir="ltr" value={f.bankBranch} onChange={(e) => setF({ ...f, bankBranch: e.target.value })} /></label>
              <label className="field" htmlFor="cAcc"><span>חשבון</span><input id="cAcc" dir="ltr" value={f.bankAccount} onChange={(e) => setF({ ...f, bankAccount: e.target.value })} /></label>
            </div>
          )}
          <label className="field" htmlFor="pNote"><span>הערה פנימית <small>(לא מוצגת למפנה)</small></span><input id="pNote" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
          <div className="row">
            <button type="button" className="btn btn-primary" disabled={busy || !(Number(f.amount) > 0)} onClick={() => run(() => recordPayment({
              appointmentId, amount: Number(f.amount), method: f.method, paidOn: f.paidOn, receiptNo: f.receiptNo, receiptUrl: f.receiptUrl, note: f.note,
              issueInvoice: morning && f.issue, sendEmail: f.send,
              cheque: f.method === 'check' ? { chequeNum: f.chequeNum, bankName: f.bankName, bankBranch: f.bankBranch, bankAccount: f.bankAccount } : undefined,
            }), () => setOpen(false))}><Icon name="check" />{busy ? 'שומר…' : 'שמירת התשלום'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>ביטול</button>
          </div>
        </div>
      )}
      {msg && <p className={msg.ok ? 'ok-msg' : 'err'} role="status">{msg.text}</p>}
    </section>
  );
}
