import 'server-only';
import { createAdminClient } from './supabase/admin';
import { SETTINGS_DEFAULTS, type Settings } from './constants';
import { SERVICE_COLS, type Service } from './services';
import { appUrl } from './mail';

/** What the public marketing pages show: the clinic's settings and active services. */
export async function landingData() {
  const db = createAdminClient();
  const [{ data: s0 }, { data: services }] = await Promise.all([
    db.from('settings').select('*').eq('id', 1).single(),
    db.from('services').select(SERVICE_COLS).eq('active', true).order('sort').order('label'),
  ]);
  const s = { ...SETTINGS_DEFAULTS, ...(s0 as Settings) } as Settings;
  return { s, services: (services as Service[] | null) ?? [] };
}

/** Structured data (schema.org) so search engines show the doctor as a physician with address and phone. */
export function physicianJsonLd(s: Settings, services: Service[]) {
  const url = appUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'Physician',
    name: s.lh_name,
    url,
    image: `${url}/brand/doctor.png`,
    medicalSpecialty: 'Neurosurgery',
    description: s.lh_titles?.split('\n')[0] || 'נוירוכירורג',
    telephone: s.lh_phone || undefined,
    email: s.lh_email || undefined,
    address: s.lh_address ? { '@type': 'PostalAddress', streetAddress: s.lh_address, addressCountry: 'IL' } : undefined,
    availableService: services.map((v) => ({ '@type': 'MedicalProcedure', name: v.label })),
  };
}

export const SITE_DESC = 'ד״ר אלרן חנוך, נוירוכירורג ילדים ומבוגרים. חוות דעת רפואיות לבית משפט ולביטוח לאומי, סיכומי ביקור והפניות. קביעת תור אונליין למטופלים, משרדי עורכי דין ומתווכים.';
