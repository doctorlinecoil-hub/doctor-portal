import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withPaid, type ApptRow } from './types';

const COLS = 'id, case_no, starts_at, ends_at, patient_id_number, referral_type, service_label, patient_name, status, payer, price, firms(name, kind)';

type Raw = Omit<ApptRow, 'paid' | 'firm_name' | 'firm_kind'> & { firms: { name: string; kind: ApptRow['firm_kind'] } | null };

/** Appointments visible to the caller (RLS decides), with amounts paid. */
export async function loadAppointments(supabase: SupabaseClient, opts: { from?: string; to?: string; order?: 'asc' | 'desc'; limit?: number; /** only appointments that hold a time slot */ slotsOnly?: boolean } = {}): Promise<ApptRow[]> {
  let q = supabase.from('appointments').select(COLS);
  if (opts.from) q = q.gte('starts_at', opts.from);
  if (opts.to) q = q.lt('starts_at', opts.to);
  if (opts.slotsOnly) q = q.eq('walk_in', false);
  q = q.order('starts_at', { ascending: opts.order !== 'desc' }).limit(opts.limit ?? 1000);
  const [{ data }, { data: totals }] = await Promise.all([q, supabase.rpc('paid_totals')]);
  const rows = ((data as unknown as Raw[]) ?? []).map(({ firms, ...r }) => ({ ...r, firm_name: firms?.name, firm_kind: firms?.kind }));
  return withPaid(rows, totals as { appointment_id: string; paid: number }[] | null) as ApptRow[];
}
