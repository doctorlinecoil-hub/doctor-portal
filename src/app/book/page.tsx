import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { SETTINGS_DEFAULTS, type Settings } from '@/lib/constants';
import { SERVICE_COLS, type Service } from '@/lib/services';
import { availableSlots, type Busy } from '@/lib/slots';
import PublicBooking from './PublicBooking';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export const metadata: Metadata = { title: 'קביעת תור · ד״ר אלרן חנוך', robots: { index: false, follow: false } };

/** The public booking page: one link the clinic sends to lawyers, brokers and patients. No sign-in. */
export default async function PublicBookPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { r } = await searchParams;
  const db = createAdminClient();
  const now = new Date();
  const { data: s0 } = await db.from('settings').select('*').eq('id', 1).single();
  const s = { ...SETTINGS_DEFAULTS, ...(s0 as Settings) } as Settings & { public_booking?: boolean };
  const until = new Date(now.getTime() + (s.horizon_days + 2) * 86400000);
  const code = r && /^[a-z0-9]{6,20}$/.test(r) ? r : '';
  const [{ data: services }, { data: appts }, { data: blocks }, { data: firm }] = await Promise.all([
    db.from('services').select(SERVICE_COLS).eq('active', true).order('sort').order('label'),
    db.from('appointments').select('starts_at, ends_at').neq('status', 'cancelled').eq('walk_in', false).gt('ends_at', now.toISOString()).lt('starts_at', until.toISOString()),
    db.from('time_blocks').select('starts_at, ends_at').gt('ends_at', now.toISOString()).lt('starts_at', until.toISOString()),
    code ? db.from('firms').select('name, kind, active').eq('book_code', code).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const busy = [...((appts as Busy[] | null) ?? []), ...((blocks as Busy[] | null) ?? [])];
  const slots = availableSlots(s, busy, now);
  const f = firm as { name: string; kind: string; active: boolean } | null;
  return (
    <PublicBooking
      open={s.public_booking !== false}
      clinic={{ name: s.lh_name, address: s.lh_address, phone: s.lh_phone, needsApproval: s.require_approval }}
      services={((services as Service[] | null) ?? []).map((x) => ({ ...x, price: Number(x.price) }))}
      slots={slots}
      code={f?.active ? code : ''}
      firm={f?.active ? { name: f.name, kind: f.kind } : null}
      phoneOk={s.phone_appointments !== false}
    />
  );
}
