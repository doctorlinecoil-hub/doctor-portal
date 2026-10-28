'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase/browser';
import { dbError } from '@/lib/constants';

export default function DoctorCancel({ appointmentId }: { appointmentId: string }) {
  const supabase = useSupabase();
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div className="row">
      <button
        type="button"
        className={`btn btn-sm btn-danger${armed ? ' armed' : ''}`}
        onClick={async () => {
          if (!armed) return setArmed(true);
          const { error } = await supabase.rpc('cancel_appointment', { p_id: appointmentId });
          setArmed(false);
          if (error) setErr(dbError(error));
          else router.push('/doctor');
        }}
      >
        {armed ? 'לחצו שוב לביטול התור' : 'ביטול התור'}
      </button>
      {err && <span className="err">{err}</span>}
    </div>
  );
}
