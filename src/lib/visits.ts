import type { SupabaseClient } from '@supabase/supabase-js';
import { ilParts } from './dates';

/**
 * The patient's earlier visits at the clinic (dates, oldest first), found by ID number, so a document can say
 * "ביקור חוזר" with the dates of the previous visits. Cancelled and unapproved requests don't count.
 */
export async function priorVisits(db: SupabaseClient, a: { id: string; patient_id_number?: string | null; starts_at: string }): Promise<string[]> {
  const raw = String(a.patient_id_number || '').replace(/\D/g, '');
  if (raw.length < 5) return [];
  const ids = [...new Set([raw, raw.padStart(9, '0'), raw.replace(/^0+/, ''), String(a.patient_id_number).trim()])];
  const { data } = await db.from('appointments').select('id, starts_at, status')
    .in('patient_id_number', ids).lt('starts_at', a.starts_at).neq('id', a.id).not('status', 'in', '(cancelled,pending)')
    .order('starts_at').limit(30);
  const visit = ilParts(a.starts_at).date;
  return [...new Set(((data as { starts_at: string }[] | null) ?? []).map((r) => ilParts(r.starts_at).date).filter((d) => d < visit))];
}
