import type { Metadata } from 'next';
import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { SETTINGS_DEFAULTS, type Settings } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'המסמך שלך', robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The link the patient gets by WhatsApp: the last 4 digits of the ID number open the final document. */
export default async function DocPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ k?: string; e?: string }> }) {
  const { id } = await params;
  const { k = '', e = '' } = await searchParams;
  const db = createAdminClient();
  const { data: s0 } = await db.from('settings').select('lh_name, lh_phone').eq('id', 1).single();
  const s = { ...SETTINGS_DEFAULTS, ...(s0 as Partial<Settings>) } as Settings;
  let ok = false;
  if (UUID.test(id) && /^[0-9a-f]{48}$/.test(k)) {
    const { data } = await db.from('appointments').select('doc_key_hash, doc_key_expires, doc_key_fails').eq('id', id).maybeSingle();
    ok = !!data && data.doc_key_hash === createHash('sha256').update(k).digest('hex') && !!data.doc_key_expires && new Date(data.doc_key_expires).getTime() > Date.now() && (data.doc_key_fails ?? 0) < 5;
  }
  return (
    <main className="dl-page">
      <div className="dl-card">
        <div className="dl-ic" aria-hidden>📄</div>
        <h1>{s.lh_name}</h1>
        {ok ? (
          <>
            <p>המסמך שלך מוכן. לפתיחה, הזינו את <b>4 הספרות האחרונות</b> של תעודת הזהות.</p>
            <form method="post" action={`/d/${id}/file`} className="dl-form">
              <input type="hidden" name="k" value={k} />
              <input name="last4" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required autoFocus autoComplete="off" dir="ltr" placeholder="••••" aria-label="4 הספרות האחרונות של תעודת הזהות" />
              <button type="submit" className="btn btn-primary">פתיחת המסמך</button>
            </form>
            {e === '1' && <p className="err">הספרות לא תואמות. אחרי 5 ניסיונות שגויים הקישור ננעל.</p>}
            <small>הקישור אישי ובתוקף ל־60 יום. אין להעביר אותו לאחרים.</small>
          </>
        ) : (
          <p>הקישור לא תקין, פג תוקפו או ננעל. {s.lh_phone ? <>לקישור חדש אפשר לפנות למרפאה: <span dir="ltr">{s.lh_phone}</span>.</> : 'לקישור חדש אפשר לפנות למרפאה.'}</p>
        )}
      </div>
    </main>
  );
}
