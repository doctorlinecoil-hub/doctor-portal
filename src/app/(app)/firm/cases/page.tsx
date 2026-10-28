import { requireUser } from '@/lib/auth';
import { loadAppointments } from '@/lib/queries';
import { FirmCasesView } from '@/views/FirmViews';

export const dynamic = 'force-dynamic';

export default async function FirmCasesPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const { supabase } = await requireUser(['firm']);
  const rows = await loadAppointments(supabase, { order: 'desc', limit: 1000 });
  return <FirmCasesView rows={rows} filter={f || 'all'} />;
}
