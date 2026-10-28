import { requireUser } from '@/lib/auth';
import { loadAppointments } from '@/lib/queries';
import { ilToUtc, todayIL } from '@/lib/dates';
import { DoctorAgendaView } from '@/views/DoctorViews';

export const dynamic = 'force-dynamic';

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const { supabase, profile } = await requireUser(['doctor', 'admin']);
  const start = ilToUtc(todayIL(), '00:00').getTime();
  const rows = await loadAppointments(supabase, { from: new Date(start - 365 * 86400000).toISOString(), order: 'asc', limit: 2000 });
  return <DoctorAgendaView rows={rows} past={view === 'past'} isAdmin={profile.role === 'admin'} name={profile.full_name || ''} />;
}
