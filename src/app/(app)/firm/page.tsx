import { requireUser } from '@/lib/auth';
import { loadAppointments } from '@/lib/queries';
import { FirmDashboardView } from '@/views/FirmViews';

export const dynamic = 'force-dynamic';

export default async function FirmHome() {
  const { supabase, profile, settings } = await requireUser(['firm']);
  const [{ data: firm }, rows] = await Promise.all([
    supabase.from('firms').select('name').eq('id', profile.firm_id!).single(),
    loadAppointments(supabase, { order: 'desc', limit: 500 }),
  ]);
  return <FirmDashboardView firmName={firm?.name ?? ''} clinicName={settings.lh_name} rows={rows} gate={settings.letter_requires_payment !== false} />;
}
