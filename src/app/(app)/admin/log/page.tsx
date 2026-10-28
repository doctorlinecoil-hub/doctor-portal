import { requireUser } from '@/lib/auth';
import { LogView, type LogRow } from '@/views/LogView';

export const dynamic = 'force-dynamic';

export default async function LogPage() {
  const { supabase } = await requireUser(['admin']);
  const [{ data: rows }, { data: people }] = await Promise.all([
    supabase.from('audit_log').select('id, user_id, action, entity, entity_id, details, at').order('at', { ascending: false }).limit(300),
    supabase.from('profiles').select('id, full_name, email'),
  ]);
  const who = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email]));
  return <LogView rows={((rows as LogRow[]) ?? []).map((r) => ({ ...r, who: (r.user_id && who.get(r.user_id)) || '' }))} />;
}
