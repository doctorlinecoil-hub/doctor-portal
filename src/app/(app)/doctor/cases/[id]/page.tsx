import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { BUCKET } from '@/lib/constants';
import { morningEnabled } from '@/lib/morning';
import { mailEnabled } from '@/lib/mail';
import { clinicOf } from '@/lib/emails';
import type { CaseDetail, DocRow, NoteRow, PaymentRow } from '@/lib/types';
import type { IntakeRow } from '@/lib/intakeTypes';
import { DoctorCaseView, payerName } from '@/views/DoctorViews';
import LetterEditor, { type LetterRow } from './LetterEditor';
import PaymentPanel from './PaymentPanel';
import DoctorCancel from './DoctorCancel';
import IntakePanel from './IntakePanel';
import CommsPanel, { type EmailLogRow } from './CommsPanel';
import ResolveButton from './ResolveButton';
import ApprovalButtons from '../../ApprovalButtons';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export default async function DoctorCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile, settings } = await requireUser(['doctor', 'admin']);
  const isAdmin = profile.role === 'admin';
  const { data: a } = await supabase.from('appointments').select('*, firm:firms(id, name, kind, contact_name, phone, email, tax_id)').eq('id', id).maybeSingle();
  if (!a) notFound();
  const [{ data: notes }, { data: docs }, { data: letter }, pays, { data: intake }, { data: emails }] = await Promise.all([
    supabase.from('case_notes').select('id, body, created_at, kind, resolved_at').eq('appointment_id', id).order('created_at'),
    supabase.from('documents').select('id, file_name, mime_type, size_bytes, storage_path, created_at').eq('appointment_id', id).order('created_at'),
    supabase.from('letters').select('*').eq('appointment_id', id).maybeSingle(),
    isAdmin
      ? supabase.from('payments').select('id, amount, method, paid_on, receipt_no, receipt_url, note, invoice_error').eq('appointment_id', id).order('paid_on').order('created_at')
      : Promise.resolve({ data: [] }),
    supabase.from('case_intake').select('status, data, error, doc_count, started_at, finished_at').eq('appointment_id', id).maybeSingle(),
    supabase.from('email_log').select('id, kind, to_addr, status, error, created_at').eq('appointment_id', id).order('created_at', { ascending: false }).limit(30),
  ]);
  const paths = (docs ?? []).map((d) => d.storage_path);
  const { data: signed } = paths.length ? await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600) : { data: [] };
  const urlFor = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  await supabase.rpc('log_event', { p_action: 'view_case', p_entity: 'appointment', p_entity_id: id });

  const c = { ...a, price: Number(a.price) } as unknown as CaseDetail;
  const payments = ((pays.data as PaymentRow[] | null) ?? []).map((p) => ({ ...p, amount: Number(p.amount) }));
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const docRows: DocRow[] = (docs ?? []).map(({ storage_path, ...d }) => ({ ...d, url: urlFor.get(storage_path) ?? null }));
  const minutes = Math.max(10, Math.round((new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60000));
  const open = c.status === 'pending' || c.status === 'booked' || c.status === 'draft';
  return (
    <DoctorCaseView
      c={c}
      notes={(notes as NoteRow[]) ?? []}
      docs={docRows}
      cancel={open ? <DoctorCancel appointmentId={id} /> : null}
      approval={<ApprovalButtons id={id} />}
      resolve={(n) => <ResolveButton noteId={n.id} caseId={id} />}
      intake={<IntakePanel appointmentId={id} intake={(intake as IntakeRow | null) ?? null} docCount={docRows.length} requestedType={c.referral_type} cancelled={c.status === 'cancelled'} />}
      comms={
        <CommsPanel
          appointmentId={id}
          status={c.status}
          info={{ caseNo: c.case_no, startsAt: c.starts_at, minutes, type: c.referral_type, patientName: c.patient_name, firmName: c.firm.name }}
          clinic={clinicOf(settings)}
          patient={{ phone: c.patient_phone, email: c.patient_email || '' }}
          firm={{ phone: c.firm.phone, name: c.firm.name }}
          letterFinal={!!(letter as LetterRow | null)?.is_final}
          letterSentAt={c.letter_sent_at ?? null}
          emails={(emails as EmailLogRow[] | null) ?? []}
          mailOn={mailEnabled()}
        />
      }
      payment={isAdmin ? <PaymentPanel appointmentId={id} price={c.price} payer={c.payer} paid={paid} payments={payments} morning={morningEnabled()} payerName={payerName(c)} /> : null}
      letter={<LetterEditor appointmentId={id} defaultType={c.referral_type} initial={(letter as LetterRow | null) ?? null} docCount={docRows.length} cancelled={c.status === 'cancelled'} />}
    />
  );
}
