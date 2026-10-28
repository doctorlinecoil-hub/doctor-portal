import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { BUCKET } from '@/lib/constants';
import { morningEnabled } from '@/lib/morning';
import type { CaseDetail, DocRow, NoteRow, PaymentRow } from '@/lib/types';
import { DoctorCaseView, payerName } from '@/views/DoctorViews';
import LetterEditor, { type LetterRow } from './LetterEditor';
import PaymentPanel from './PaymentPanel';
import DoctorCancel from './DoctorCancel';

export const dynamic = 'force-dynamic';

export default async function DoctorCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile } = await requireUser(['doctor', 'admin']);
  const isAdmin = profile.role === 'admin';
  const { data: a } = await supabase.from('appointments').select('*, firm:firms(id, name, kind, contact_name, phone, email, tax_id)').eq('id', id).maybeSingle();
  if (!a) notFound();
  const [{ data: notes }, { data: docs }, { data: letter }, pays] = await Promise.all([
    supabase.from('case_notes').select('id, body, created_at').eq('appointment_id', id).order('created_at'),
    supabase.from('documents').select('id, file_name, mime_type, size_bytes, storage_path, created_at').eq('appointment_id', id).order('created_at'),
    supabase.from('letters').select('*').eq('appointment_id', id).maybeSingle(),
    isAdmin
      ? supabase.from('payments').select('id, amount, method, paid_on, receipt_no, receipt_url, note, invoice_error').eq('appointment_id', id).order('paid_on').order('created_at')
      : Promise.resolve({ data: [] }),
  ]);
  const paths = (docs ?? []).map((d) => d.storage_path);
  const { data: signed } = paths.length ? await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600) : { data: [] };
  const urlFor = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  await supabase.rpc('log_event', { p_action: 'view_case', p_entity: 'appointment', p_entity_id: id });

  const c = { ...a, price: Number(a.price) } as unknown as CaseDetail;
  const payments = ((pays.data as PaymentRow[] | null) ?? []).map((p) => ({ ...p, amount: Number(p.amount) }));
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const docRows: DocRow[] = (docs ?? []).map(({ storage_path, ...d }) => ({ ...d, url: urlFor.get(storage_path) ?? null }));
  return (
    <DoctorCaseView
      c={c}
      notes={(notes as NoteRow[]) ?? []}
      docs={docRows}
      cancel={(c.status === 'booked' || c.status === 'draft') ? <DoctorCancel appointmentId={id} /> : null}
      payment={isAdmin ? <PaymentPanel appointmentId={id} price={c.price} payer={c.payer} paid={paid} payments={payments} morning={morningEnabled()} payerName={payerName(c)} /> : null}
      letter={<LetterEditor appointmentId={id} defaultType={c.referral_type} initial={(letter as LetterRow | null) ?? null} docCount={docRows.length} cancelled={c.status === 'cancelled'} />}
    />
  );
}
