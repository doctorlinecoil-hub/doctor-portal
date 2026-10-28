import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import type { ReferralType } from '@/lib/constants';
import { todayIL } from '@/lib/dates';
import LetterPaper from '@/views/LetterPaper';
import PrintButton from './PrintButton';

export const dynamic = 'force-dynamic';

type L = { letter_type: ReferralType; recipient: string; subject: string; body: string; letter_date: string | null };

export default async function PrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const { id } = await params;
  const { v } = await searchParams;
  const { supabase, settings, staff } = await requireUser();
  const { data: a } = await supabase.from('appointments').select('id, patient_name, patient_id_number, patient_dob').eq('id', id).maybeSingle();
  if (!a) notFound();

  let letter: L | null = null;
  const draft = staff && v === 'draft';
  if (draft) {
    const { data } = await supabase.from('letters').select('letter_type, recipient, subject, body, letter_date').eq('appointment_id', id).maybeSingle();
    letter = data as L | null;
  } else {
    const { data } = await supabase.rpc('final_letter', { p_id: id });
    letter = Array.isArray(data) && data.length ? (data[0] as L) : null;
  }
  if (!letter) {
    return <main className="auth-form"><div className="auth-card"><div className="panel"><h1>המכתב עוד לא זמין</h1><p className="muted">כשהרופא יסיים את המכתב (ואם נדרש, אחרי התשלום), הוא יופיע כאן.</p></div></div></main>;
  }
  await supabase.rpc('log_event', { p_action: draft ? 'print_draft' : 'print_final', p_entity: 'letter', p_entity_id: id });

  const date = draft ? todayIL() : letter.letter_date || todayIL();
  return (
    <LetterPaper
      settings={settings}
      letter={{ ...letter, letter_date: date }}
      patient={{ name: a.patient_name, idNumber: a.patient_id_number, dob: a.patient_dob }}
      backHref={staff ? `/doctor/cases/${id}` : `/firm/cases/${id}`}
      draft={draft}
      printButton={<PrintButton />}
    />
  );
}
