import { createClient } from '@/lib/supabase/server';
import { drugDetails, searchDrugs } from '@/lib/drugs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Drug search for the prescription form (clinic staff only). ?q=name or ?reg=registration number */
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: staff } = await supabase.rpc('is_staff');
  if (!staff) return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const url = new URL(req.url);
  const reg = url.searchParams.get('reg');
  if (reg) {
    const d = await drugDetails(reg);
    return d ? Response.json({ drug: d }) : Response.json({ error: 'לא נמצא' }, { status: 404 });
  }
  const hits = await searchDrugs(url.searchParams.get('q') || '');
  if (hits === null) return Response.json({ error: 'מאגר התרופות של משרד הבריאות לא זמין כרגע. אפשר להקליד ידנית.' }, { status: 503 });
  return Response.json({ hits });
}
