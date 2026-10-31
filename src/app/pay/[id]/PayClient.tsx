'use client';
import DepositBox, { type PayInfo } from '@/components/DepositBox';
import { depositProofDone, depositProofUrl, payProofDone, payProofUrl } from '@/app/book/actions';

/** The upload of the transfer confirmation: for the deposit that holds a slot, or for a ready document that waits for payment. */
export default function PayClient({ id, k, amount, pay, holdHours, sent, mode = 'deposit' }: { id: string; k: string; amount: number; pay: PayInfo; holdHours?: number; sent: boolean; mode?: 'deposit' | 'balance' }) {
  const balance = mode === 'balance';
  return (
    <DepositBox amount={amount} title={balance ? 'תשלום עבור המסמך' : 'מקדמה לשריון התור'} pay={pay} holdHours={balance ? undefined : holdHours} sent={sent}
      lead={balance ? 'אחרי ההעברה העלו כאן צילום של האישור. מיד כשהרופא יאשר את התשלום, המסמך יישלח אליכם למייל כקובץ PDF.' : undefined}
      upload={async (f) => {
        const u = balance
          ? await payProofUrl(id, k, { name: f.name, size: f.size, type: f.type })
          : await depositProofUrl(id, k, { name: f.name, size: f.size, type: f.type });
        if (!u.ok) return { ok: false, error: u.error };
        const body = new FormData();
        body.append('cacheControl', '3600');
        body.append('', f);
        const res = await fetch(u.url, { method: 'PUT', body, headers: { 'x-upsert': 'false' } }).catch(() => null);
        if (!res?.ok) return { ok: false, error: 'ההעלאה נכשלה. נסו שוב.' };
        return balance
          ? payProofDone(id, k, { path: u.path, name: f.name, type: f.type })
          : depositProofDone(id, k, { path: u.path, name: f.name, type: f.type });
      }} />
  );
}
