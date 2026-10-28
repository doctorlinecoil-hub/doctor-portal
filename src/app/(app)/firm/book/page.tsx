import { requireUser } from '@/lib/auth';
import { availableSlots, type Busy } from '@/lib/slots';
import BookingForm from './BookingForm';

export const dynamic = 'force-dynamic';

export default async function FirmBookingPage() {
  const { supabase, profile, settings } = await requireUser(['firm']);
  const now = new Date();
  const until = new Date(now.getTime() + (settings.horizon_days + 2) * 86400000);
  const { data: busy } = await supabase.rpc('busy_slots', { p_from: now.toISOString(), p_to: until.toISOString() });
  const slots = availableSlots(settings, (busy as Busy[] | null) ?? [], now);
  return <BookingForm firmId={profile.firm_id!} slots={slots} horizon={settings.horizon_days} prices={settings.prices} clinicName={settings.lh_name} />;
}
