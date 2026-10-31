import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import type { ReferralType } from '@/lib/constants';
import { ilParts, todayIL } from '@/lib/dates';
import { SIGNATURE_DATA_URI } from '@/lib/brandAssets';
import LetterPaper from '@/views/LetterPaper';
import { priorVisits } from '@/lib/visits';
import PrintButton from './PrintButton';

export const dynamic = 'force-dynamic';

type L = { letter_type: ReferralType; recipient: string; subject: string; body: string; letter_date: string | null; show_visits?: boolean };

export default async function PrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string; embed?: string }> }) {
  const { id } = await params;
  const { v, embed } = await searchParams;
  const { supabase, settings, staff } = await requireUser();
  const { data: a } = await supabase.from('appointments').select('id, patient_name, patient_id_number, patient_dob, starts_at, service_label, referral_type').eq('id', id).maybeSingle();
  if (!a) notFound();

  let letter: L | null = null;
  const draft = staff && v === 'draft';
  // how the final document will look, before the doctor confirms it (signature included, nothing is sent)
  const review = staff && v === 'preview';
  if (draft || review) {
    const { data } = await supabase.from('letters').select('letter_type, recipient, subject:doc_title, body, letter_date, show_visits').eq('appointment_id', id).maybeSingle();
    letter = data as L | null;
  } else {
    const { data } = await supabase.rpc('final_letter', { p_id: id });
    letter = Array.isArray(data) && data.length ? (data[0] as L) : null;
  }
  if (!letter) {
    return <main className="auth-form"><div className="auth-card"><div className="panel"><h1>המכתב עוד לא זמין</h1><p className="muted">כשהרופא יסיים את המכתב (ואם נדרש, אחרי התשלום), הוא יופיע כאן.</p></div></div></main>;
  }
  await supabase.rpc('log_event', { p_action: draft || review ? 'print_draft' : 'print_final', p_entity: 'letter', p_entity_id: id });

  const date = letter.letter_date || todayIL();
  // earlier visits are printed only when the doctor added them to the document
  const visits = letter.show_visits ? await priorVisits(supabase, a) : [];
  return (
    <LetterPaper
      settings={settings}
      letter={{ ...letter, letter_date: date }}
      patient={{ name: a.patient_name ?? '', idNumber: a.patient_id_number ?? '', dob: a.patient_dob }}
      backHref={staff ? `/doctor/cases/${id}` : `/firm/cases/${id}`}
      title={(a.referral_type === letter.letter_type && a.service_label) || undefined}
      visitDate={ilParts(a.starts_at).date}
      visits={visits}
      signature={!draft && settings.sign_final ? SIGNATURE_DATA_URI : null}
      embed={embed === '1'}
      draft={draft}
      printButton={<PrintButton />}
    />
  );
}
