import { requireUser } from '@/lib/auth';
import LiveRefresh from '@/components/LiveRefresh';
import { loadAppointments } from '@/lib/queries';
import { availableSlots, type Busy } from '@/lib/slots';
import { FirmDashboardView } from '@/views/FirmViews';

export const dynamic = 'force-dynamic';

export default async function FirmHome() {
  const { supabase, profile, settings } = await requireUser(['firm']);
  const now = new Date();
  const until = new Date(now.getTime() + 21 * 86400000);
  const [{ data: firm }, rows, { data: busy }] = await Promise.all([
    supabase.from('firms').select('name').eq('id', profile.firm_id!).single(),
    loadAppointments(supabase, { order: 'desc', limit: 500 }),
    supabase.rpc('busy_slots', { p_from: now.toISOString(), p_to: until.toISOString() }),
  ]);
  // the next free times, for booking in one tap from the dashboard
  const free = availableSlots(settings, (busy as Busy[] | null) ?? [], now).slice(0, 4).map((d) => ({ date: d.date, times: d.times.slice(0, 6) }));
  return <><LiveRefresh /><FirmDashboardView firmName={firm?.name ?? ''} clinicName={settings.lh_name} rows={rows} gate={settings.letter_requires_payment !== false} free={free} /></>;
}
