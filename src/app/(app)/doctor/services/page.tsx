import { requireUser } from '@/lib/auth';
import { SERVICE_COLS, type Service } from '@/lib/services';
import { PageHead } from '@/components/ui';
import ServicesAdmin from './ServicesAdmin';

export const dynamic = 'force-dynamic';

/** The clinic's own list of referral types ("מה צריך מהרופא?"): names, descriptions, prices, order. */
export default async function ServicesPage() {
  const { supabase } = await requireUser(['doctor', 'admin']);
  const { data } = await supabase.from('services').select(SERVICE_COLS).order('sort').order('label');
  return (
    <>
      <PageHead title="סוגי שירות ומחירים" sub="מה שהמפנים רואים בשאלה ״מה צריך מהרופא?״. אפשר לשנות שמות, תיאורים ומחירים, להוסיף סוגים חדשים, לסדר ולהסתיר." />
      <ServicesAdmin initial={((data as Service[] | null) ?? []).map((s) => ({ ...s, price: Number(s.price) }))} />
    </>
  );
}
