import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession, homeFor } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { SETTINGS_DEFAULTS, type Settings } from '@/lib/constants';
import { SERVICE_COLS, type Service } from '@/lib/services';
import Landing from '@/views/Landing';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'ד״ר אלרן חנוך · נוירוכירורג · חוות דעת רפואיות',
  description: 'ד״ר אלרן חנוך, נוירוכירורג ילדים ומבוגרים. חוות דעת רפואיות לבית משפט ולביטוח לאומי, סיכומי ביקור והפניות. קביעת תור מקוונת למשרדי עורכי דין, מתווכים ומטופלים.',
};

/** Signed-in users go to their home; everyone else sees the clinic's page. */
export default async function Home({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const { claims, profile } = await getSession();
  const signedIn = !!(claims && profile?.active);
  // signed-in users go to their home, unless they asked to see the public page
  if (signedIn && view !== 'public') redirect(homeFor(profile!.role));
  const db = createAdminClient();
  const [{ data: s0 }, { data: services }] = await Promise.all([
    db.from('settings').select('*').eq('id', 1).single(),
    db.from('services').select(SERVICE_COLS).eq('active', true).order('sort').order('label'),
  ]);
  const s = { ...SETTINGS_DEFAULTS, ...(s0 as Settings) } as Settings;
  return <Landing s={s} services={(services as Service[] | null) ?? []} home={signedIn ? homeFor(profile!.role) : null} />;
}
