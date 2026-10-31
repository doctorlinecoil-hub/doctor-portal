import { requireUser } from '@/lib/auth';
import { availableSlots, type Busy } from '@/lib/slots';
import { SERVICE_COLS, type Service } from '@/lib/services';
import PublicBooking from '@/app/book/PublicBooking';
import SlotBooking from './SlotBooking';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** New appointment from the office's portal: the same simple wizard as the public page, already tied to the office. */
export default async function FirmBookingPage({ searchParams }: { searchParams: Promise<{ slot?: string; service?: string }> }) {
  const { slot, service } = await searchParams;
  const { supabase, profile, settings } = await requireUser(['firm']);
  const now = new Date();
  const until = new Date(now.getTime() + (settings.horizon_days + 2) * 86400000);
  const [{ data: busy }, { data: firm }, { data: services }] = await Promise.all([
    supabase.rpc('busy_slots', { p_from: now.toISOString(), p_to: until.toISOString() }),
    supabase.from('firms').select('name, kind, book_code, active').eq('id', profile.firm_id!).maybeSingle(),
    supabase.from('services').select(SERVICE_COLS).eq('active', true).order('sort').order('label'),
  ]);
  const slots = availableSlots(settings, (busy as Busy[] | null) ?? [], now);
  // no personal link (should not happen): the older booking screen still works
  if (!firm?.book_code || !firm.active) {
    return <SlotBooking firmId={profile.firm_id!} slots={slots} horizon={settings.horizon_days} clinicName={settings.lh_name} needsApproval={settings.require_approval} phoneOk={settings.phone_appointments !== false} />;
  }
  return (
    <PublicBooking
      embedded
      open
      clinic={{ name: settings.lh_name, address: settings.lh_address, phone: settings.lh_phone, needsApproval: settings.require_approval }}
      services={((services as Service[] | null) ?? []).map((x) => ({ ...x, price: 0 }))}
      slots={slots}
      code={firm.book_code}
      firm={{ name: firm.name, kind: firm.kind }}
      phoneOk={settings.phone_appointments !== false}
      initialSlot={slot}
      preselect={service}
    />
  );
}
