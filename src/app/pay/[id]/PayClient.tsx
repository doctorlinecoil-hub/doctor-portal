'use client';
import DepositBox, { type PayInfo } from '@/components/DepositBox';
import { depositProofDone, depositProofUrl } from '@/app/book/actions';

export default function PayClient({ id, k, amount, pay, holdHours, sent }: { id: string; k: string; amount: number; pay: PayInfo; holdHours: number; sent: boolean }) {
  return (
    <DepositBox amount={amount} title="מקדמה לשריון התור" pay={pay} holdHours={holdHours} sent={sent}
      upload={async (f) => {
        const u = await depositProofUrl(id, k, { name: f.name, size: f.size, type: f.type });
        if (!u.ok) return { ok: false, error: u.error };
        const body = new FormData();
        body.append('cacheControl', '3600');
        body.append('', f);
        const res = await fetch(u.url, { method: 'PUT', body, headers: { 'x-upsert': 'false' } }).catch(() => null);
        if (!res?.ok) return { ok: false, error: 'ההעלאה נכשלה. נסו שוב.' };
        return depositProofDone(id, k, { path: u.path, name: f.name, type: f.type });
      }} />
  );
}
