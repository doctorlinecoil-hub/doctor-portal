import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import type { Extracted } from '@/lib/extract';
import type { Payer, ReferralType } from '@/lib/constants';
import DetailsWizard from './DetailsWizard';

export const dynamic = 'force-dynamic';
// the AI scan of the documents runs inside this page's server action
export const maxDuration = 300;

export default async function CaseDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile, settings } = await requireUser(['firm']);
  const { data: a } = await supabase
    .from('appointments')
    .select('id, case_no, starts_at, status, referral_type, patient_name, patient_id_number, patient_dob, patient_phone, patient_email, payer, notes, submitted_by, details_at, extract, firm:firms(kind)')
    .eq('id', id)
    .maybeSingle();
  if (!a) notFound();
  if (a.status === 'cancelled' || a.status === 'done') redirect(`/firm/cases/${id}`);
  const { data: docs } = await supabase.from('documents').select('id, file_name, size_bytes, created_at').eq('appointment_id', id).order('created_at');
  const kind = (a.firm as { kind?: string } | null)?.kind ?? '';
  return (
    <DetailsWizard
      c={{
        id: a.id, caseNo: a.case_no, startsAt: a.starts_at, status: a.status,
        type: (a.referral_type as ReferralType | null) ?? null,
        name: a.patient_name ?? '', idNumber: a.patient_id_number ?? '', dob: a.patient_dob ?? '', phone: a.patient_phone ?? '', email: a.patient_email ?? '',
        payer: (a.details_at ? a.payer : kind === 'private' ? 'patient' : 'referrer') as Payer,
        notes: a.notes ?? '', submittedBy: a.submitted_by || profile.full_name || '', detailsAt: a.details_at, extract: (a.extract as Extracted | null) ?? null,
      }}
      firmId={profile.firm_id!}
      docs={docs ?? []}
      prices={settings.prices}
    />
  );
}
