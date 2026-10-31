import { requireUser } from '@/lib/auth';
import LiveRefresh from '@/components/LiveRefresh';
import { loadAppointments } from '@/lib/queries';
import { FirmCasesView } from '@/views/FirmViews';

export const dynamic = 'force-dynamic';

export default async function FirmCasesPage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string; open?: string }> }) {
  const { f, q, open } = await searchParams;
  const { supabase, settings } = await requireUser(['firm']);
  const rows = await loadAppointments(supabase, { order: 'desc', limit: 1000 });
  return <><LiveRefresh /><FirmCasesView rows={rows} filter={f || 'all'} q={String(q || '').slice(0, 60)} open={open} gate={settings.letter_requires_payment !== false} clinicPhone={settings.lh_phone || ''} /></>;
}
