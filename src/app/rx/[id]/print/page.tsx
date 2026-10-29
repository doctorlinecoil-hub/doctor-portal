import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { rxBody, rxCss } from '@/lib/rx';
import type { RxItem } from '@/lib/rxTypes';
import Icon from '@/components/Icon';
import PrintButton from '@/app/letters/[id]/print/PrintButton';

export const dynamic = 'force-dynamic';

/** A prescription on the clinic's letterhead, printed by the browser (or saved as PDF). Clinic staff only. */
export default async function RxPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, settings } = await requireUser(['doctor', 'admin']);
  const { data: rx } = await supabase.from('prescriptions').select('id, appointment_id, items, notes, rx_date').eq('id', id).maybeSingle();
  if (!rx) notFound();
  const { data: a } = await supabase.from('appointments').select('patient_name, patient_id_number, patient_dob').eq('id', rx.appointment_id).maybeSingle();
  if (!a) notFound();
  await supabase.rpc('log_event', { p_action: 'print_rx', p_entity: 'appointment', p_entity_id: rx.appointment_id });
  const html = rxBody(settings, { items: (rx.items as RxItem[]) ?? [], notes: rx.notes ?? '', rx_date: rx.rx_date }, { name: a.patient_name ?? '', idNumber: a.patient_id_number ?? '', dob: a.patient_dob });
  return (
    <div className="letter-view">
      <style>{`
        @page { size: A4; margin: 16mm 18mm; }
        ${rxCss('.rxpaper')}
        .letter-view { background: #E9EDF2; min-height: 100vh; padding: 0 0 40px; }
        .rxpaper { width: 210mm; min-height: 200mm; margin: 16px auto 0; background: #fff; padding: 16mm 18mm; box-shadow: 0 2px 14px rgba(0,0,0,.18); }
        .toolbar { max-width: 210mm; margin: 0 auto; padding: 16px 16px 0; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
        @media print { .letter-view { background: #fff; padding: 0; } .rxpaper { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; } }
        @media (max-width: 820px) { .rxpaper { width: auto; margin: 16px; padding: 18px; } }
      `}</style>
      <div className="toolbar no-print">
        <Link href={`/doctor/cases/${rx.appointment_id}#rx`} className="btn btn-ghost"><Icon name="arrowLeft" />חזרה לתיק</Link>
        <div className="row"><span className="hint">בחלון ההדפסה אפשר לבחור ״שמירה כ־PDF״</span><PrintButton /></div>
      </div>
      <article className="rxpaper" aria-label="מרשם" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
