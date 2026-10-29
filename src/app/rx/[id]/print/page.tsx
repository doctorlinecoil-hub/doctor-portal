import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { rxBody } from '@/lib/rx';
import type { RxItem } from '@/lib/rxTypes';
import { PaperFrame } from '@/views/LetterPaper';
import PrintButton from '@/app/letters/[id]/print/PrintButton';

export const dynamic = 'force-dynamic';

/** A prescription on the clinic's letterhead, printed by the browser (or saved as PDF). Clinic staff only. */
export default async function RxPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, settings } = await requireUser(['doctor', 'admin']);
  const { data: rx } = await supabase.from('prescriptions').select('id, appointment_id, items, notes, rx_date, rx_no').eq('id', id).maybeSingle();
  if (!rx) notFound();
  const { data: a } = await supabase.from('appointments').select('patient_name, patient_id_number, patient_dob').eq('id', rx.appointment_id).maybeSingle();
  if (!a) notFound();
  await supabase.rpc('log_event', { p_action: 'print_rx', p_entity: 'appointment', p_entity_id: rx.appointment_id });
  const html = rxBody(settings, { items: (rx.items as RxItem[]) ?? [], notes: rx.notes ?? '', rx_date: rx.rx_date, rx_no: rx.rx_no }, { name: a.patient_name ?? '', idNumber: a.patient_id_number ?? '', dob: a.patient_dob }, '/brand/letterhead.jpg');
  return <PaperFrame backHref={`/doctor/cases/${rx.appointment_id}#rx`} printButton={<PrintButton />} hint="מרשם רשמי · מומלץ להדפיס בצבע ולהחתים בחותמת" html={html} />;
}
