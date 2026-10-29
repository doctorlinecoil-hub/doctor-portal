import { requireUser } from '@/lib/auth';
import { availableSlots, type Busy } from '@/lib/slots';
import BookingForm from '../../firm/book/BookingForm';
import { SERVICE_COLS, type Service } from '@/lib/services';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** The clinic books an appointment: for a referrer, or for a patient who called directly. */
export default async function ClinicBookingPage({ searchParams }: { searchParams: Promise<{ firm?: string; slot?: string }> }) {
  const { firm, slot } = await searchParams;
  const { supabase, settings } = await requireUser(['doctor', 'admin']);
  const now = new Date();
  const until = new Date(now.getTime() + (settings.horizon_days + 2) * 86400000);
  const [{ data: busy }, { data: firms }, { data: services }] = await Promise.all([
    supabase.rpc('busy_slots', { p_from: now.toISOString(), p_to: until.toISOString() }),
    supabase.from('firms').select('id, name, kind').eq('active', true).order('kind', { ascending: false }).order('name'),
    supabase.from('services').select(SERVICE_COLS).eq('active', true).order('sort').order('label'),
  ]);
  const list = (firms as { id: string; name: string; kind: string }[] | null) ?? [];
  const sorted = [...list.filter((f) => f.kind === 'private'), ...list.filter((f) => f.kind !== 'private')];
  const first = sorted.find((f) => f.id === firm)?.id ?? sorted[0]?.id ?? '';
  // the clinic may book at short notice
  const slots = availableSlots({ ...settings, notice_hours: 0 }, (busy as Busy[] | null) ?? [], now);
  return <BookingForm firmId={first} firms={sorted} slots={slots} horizon={settings.horizon_days} services={(services as Service[] | null) ?? []} clinicName={settings.lh_name} needsApproval={false} initialSlot={slot} phoneOk={settings.phone_appointments !== false} />;
}
