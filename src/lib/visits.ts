import type { SupabaseClient } from '@supabase/supabase-js';
import { ilParts } from './dates';
import { bodyDraftText } from './richtext';

export type Visit = { date: string; label: string };

/**
 * The patient's earlier visits at the clinic (oldest first), found by ID number within the same referrer, so a document can say
 * "ביקור חוזר" and list the previous visits. Cancelled and unapproved requests don't count.
 */
export async function priorVisits(db: SupabaseClient, a: { id: string; patient_id_number?: string | null; starts_at: string; firm_id?: string | null }): Promise<Visit[]> {
  const raw = String(a.patient_id_number || '').replace(/\D/g, '');
  if (raw.length < 5) return [];
  const ids = [...new Set([raw, raw.padStart(9, '0'), raw.replace(/^0+/, ''), String(a.patient_id_number).trim()])];
  // only this referrer's own earlier cases: another office's visits must never show up in a document they get
  if (!a.firm_id) return [];
  const { data } = await db.from('appointments').select('id, starts_at, status, service_label')
    .in('patient_id_number', ids).eq('firm_id', a.firm_id).eq('provisional', false).lt('starts_at', a.starts_at).neq('id', a.id).not('status', 'in', '(cancelled,pending)')
    .order('starts_at').limit(30);
  const visit = ilParts(a.starts_at).date;
  const seen = new Set<string>();
  const out: Visit[] = [];
  for (const r of (data as { starts_at: string; service_label: string | null }[] | null) ?? []) {
    const date = ilParts(r.starts_at).date;
    const label = (r.service_label || '').trim() || 'ביקור במרפאה';
    if (date >= visit || seen.has(date + label)) continue;
    seen.add(date + label);
    out.push({ date, label });
  }
  return out;
}

/** The final letters of the patient's earlier visits (newest first), as plain text: their background can go into a new letter. */
export async function priorLetters(db: SupabaseClient, a: { id: string; patient_id_number?: string | null; starts_at: string; firm_id?: string | null }, limit = 3): Promise<{ date: string; label: string; text: string }[]> {
  const raw = String(a.patient_id_number || '').replace(/\D/g, '');
  if (raw.length < 5) return [];
  const ids = [...new Set([raw, raw.padStart(9, '0'), raw.replace(/^0+/, ''), String(a.patient_id_number).trim()])];
  if (!a.firm_id) return [];
  const { data: appts } = await db.from('appointments').select('id, starts_at, service_label')
    .in('patient_id_number', ids).eq('firm_id', a.firm_id).eq('provisional', false).lt('starts_at', a.starts_at).neq('id', a.id).not('status', 'in', '(cancelled,pending)')
    .order('starts_at', { ascending: false }).limit(10);
  const list = (appts as { id: string; starts_at: string; service_label: string | null }[] | null) ?? [];
  if (!list.length) return [];
  const { data: letters } = await db.from('letters').select('appointment_id, final_body, body, is_final').in('appointment_id', list.map((x) => x.id));
  const byId = new Map(((letters as { appointment_id: string; final_body: string | null; body: string | null; is_final: boolean }[] | null) ?? []).map((l) => [l.appointment_id, l]));
  const out: { date: string; label: string; text: string }[] = [];
  for (const x of list) {
    const l = byId.get(x.id);
    const text = bodyDraftText((l?.is_final ? l.final_body : l?.body) || '').trim();
    if (text) out.push({ date: ilParts(x.starts_at).date, label: x.service_label || 'ביקור', text: text.slice(0, 12000) });
    if (out.length >= limit) break;
  }
  return out;
}
