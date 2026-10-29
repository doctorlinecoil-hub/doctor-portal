import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { autoDraft } from '@/lib/autodraft';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// writing a full letter from the documents takes a few minutes, so it gets its own time budget
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Called once right after a referrer completes a case: the AI writes the first draft of the letter for the doctor. */
export async function POST(req: Request) {
  const input = await req.json().catch(() => null);
  const id = String(input?.id || '');
  if (!UUID.test(id)) return Response.json({ ok: false }, { status: 400 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return Response.json({ ok: false }, { status: 401 });
  // row level security: only the case's referrer or the clinic sees it
  const { data: a } = await supabase.from('appointments').select('id, details_at, status').eq('id', id).maybeSingle();
  if (!a?.details_at || a.status === 'cancelled') return Response.json({ ok: false }, { status: 404 });
  // only right after the details were completed (the call cannot be repeated later to spend AI credit)
  if (Date.now() - new Date(a.details_at).getTime() > 20 * 60_000) return Response.json({ ok: true, skipped: true });
  // once per case
  const db = createAdminClient();
  const { count } = await db.from('audit_log').select('id', { count: 'exact', head: true }).eq('entity_id', id).eq('action', 'ai_autodraft');
  if (count) return Response.json({ ok: true, skipped: true });
  await db.from('audit_log').insert({ user_id: auth.claims.sub ?? null, action: 'ai_autodraft', entity: 'appointment', entity_id: id });
  after(async () => {
    await autoDraft(id).catch((e) => console.error('auto draft failed', (e as Error).message));
  });
  return Response.json({ ok: true });
}
