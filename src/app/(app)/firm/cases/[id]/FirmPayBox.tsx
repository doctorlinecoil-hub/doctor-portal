'use client';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase/browser';
import { uploadCaseFiles } from '@/lib/upload';
import DepositBox, { type PayInfo } from '@/components/DepositBox';
import { firmPaymentProof } from '../../actions';

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
      lead={mode === 'deposit' ? 'אחרי ההעברה העלו צילום של האישור. הרופא יאשר את התור מיד כשהמקדמה תתקבל.' : 'אחרי ההעברה העלו כאן צילום של האישור. מיד כשהרופא יאשר את התשלום, המסמך יישלח אליכם למייל כקובץ PDF.'}
      pay={pay}
      holdHours={mode === 'deposit' ? holdHours : undefined}
      sent={sent}
      upload={async (f) => {
        const named = new File([f], `אישור העברה - ${f.name}`, { type: f.type });
        const failed = await uploadCaseFiles(supabase, firmId, appointmentId, [named]);
        if (failed.length) return { ok: false, error: 'ההעלאה נכשלה. נסו שוב.' };
        if (mode === 'deposit') await supabase.rpc('deposit_proof_sent', { p_id: appointmentId });
        else await firmPaymentProof(appointmentId).catch(() => undefined);
        router.refresh();
        return { ok: true };
      }}
    />
  );
}
