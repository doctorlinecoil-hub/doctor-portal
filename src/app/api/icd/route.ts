import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ICD-10 diagnosis search (the U.S. National Library of Medicine's free ICD-10-CM service). Clinic staff only. */
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: staff } = await supabase.rpc('is_staff');
  if (!staff) return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const q = (new URL(req.url).searchParams.get('q') || '').trim().slice(0, 80);
  if (q.length < 2) return Response.json({ hits: [] });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search?sf=code,name&df=code,name&maxList=15&terms=${encodeURIComponent(q)}`, { signal: ctrl.signal });
    const j = await r.json();
    const rows = (Array.isArray(j?.[3]) ? j[3] : []) as [string, string][];
    return Response.json({ hits: rows.map(([code, name]) => ({ code, name })) });
  } catch {
    return Response.json({ error: 'מאגר האבחנות לא זמין כרגע. אפשר להקליד ידנית.' }, { status: 503 });
  } finally {
    clearTimeout(t);
  }
}
