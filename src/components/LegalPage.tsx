import { createAdminClient } from '@/lib/supabase/admin';
import { SETTINGS_DEFAULTS, type Settings } from '@/lib/constants';

export async function clinic() {
  const { data } = await createAdminClient().from('settings').select('*').eq('id', 1).single();
  return { ...SETTINGS_DEFAULTS, ...(data as Settings) } as Settings;
}

/** A plain page for the legal texts, with the clinic's header and footer. */
export default function LegalPage({ s, title, updated, children }: { s: Settings; title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          <a href="/" className="lp-brand"><img src="/brand/emblem.png" alt="" width={40} height={40} /><span><b>{s.lh_name}</b></span></a>
          <div className="lp-nav-cta" style={{ marginInlineStart: 'auto' }}><a className="btn btn-primary" href="/book">קביעת תור</a></div>
        </div>
      </header>
      <main className="legal">
        <h1>{title}</h1>
        <p className="hint">עודכן לאחרונה: {updated}</p>
        {children}
      </main>
      <footer className="lp-foot"><div className="lp-wrap lp-foot-in"><span>© {new Date().getFullYear()} {s.lh_name}</span><nav><a href="/terms">תנאי שימוש</a><a href="/privacy">מדיניות פרטיות</a><a href="/accessibility">הצהרת נגישות</a></nav></div></footer>
    </div>
  );
}
