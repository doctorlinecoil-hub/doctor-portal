'use client';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase/browser';
import { uploadCaseFiles } from '@/lib/upload';
import DepositBox, { type PayInfo } from '@/components/DepositBox';

/** In the case page: the deposit (with the transfer confirmation upload), or the balance to pay after approval. */
export default function FirmPayBox({ appointmentId, firmId, mode, amount, pay, holdHours, sent }: {
  appointmentId: string; firmId: string; mode: 'deposit' | 'balance'; amount: number; pay: PayInfo; holdHours?: number; sent?: boolean;
}) {
  const supabase = useSupabase();
  const router = useRouter();
  return (
    <DepositBox
      amount={amount}
      title={mode === 'deposit' ? 'מקדמה לשריון התור' : 'יתרה לתשלום'}
      lead={mode === 'deposit' ? 'אחרי ההעברה העלו צילום של האישור. הרופא יאשר את התור מיד כשהמקדמה תתקבל.' : 'נא להעביר את התשלום לפני הביקור, ולהעלות את אישור ההעברה.'}
      pay={pay}
      holdHours={mode === 'deposit' ? holdHours : undefined}
      sent={sent}
      upload={async (f) => {
        const named = new File([f], `אישור העברה - ${f.name}`, { type: f.type });
        const failed = await uploadCaseFiles(supabase, firmId, appointmentId, [named]);
        if (failed.length) return { ok: false, error: 'ההעלאה נכשלה. נסו שוב.' };
        await supabase.rpc('deposit_proof_sent', { p_id: appointmentId });
        router.refresh();
        return { ok: true };
      }}
    />
  );
}
