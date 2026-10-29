import { requireUser } from '@/lib/auth';
import { ilParts } from '@/lib/dates';
import NewCaseForm from './NewCaseForm';
import { SERVICE_COLS, type Service } from '@/lib/services';

export const dynamic = 'force-dynamic';

/** A letter or a prescription for any patient, without booking a slot in the calendar. */
export default async function NewDocumentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const { supabase } = await requireUser(['doctor', 'admin']);
  const [{ data: firms }, { data: services }] = await Promise.all([
    supabase.from('firms').select('id, name, kind').eq('active', true).order('name'),
    supabase.from('services').select(SERVICE_COLS).eq('active', true).order('sort').order('label'),
  ]);
  const list = (firms as { id: string; name: string; kind: string }[] | null) ?? [];
  const sorted = [...list.filter((f) => f.kind === 'private'), ...list.filter((f) => f.kind !== 'private')];
  const now = ilParts(new Date());
  const pick = (v?: string, n = 120) => String(v ?? '').slice(0, n);
  return (
    <NewCaseForm
      firms={sorted}
      services={(services as Service[] | null) ?? []}
      initial={{ firm: sorted.find((f) => f.id === q.firm)?.id ?? sorted[0]?.id ?? '', name: pick(q.name), id: pick(q.id, 20), dob: pick(q.dob, 10), phone: pick(q.phone, 30), email: pick(q.email, 200), what: q.what === 'rx' ? 'rx' : 'letter', date: now.date, time: now.time.slice(0, 5) }}
    />
  );
}
