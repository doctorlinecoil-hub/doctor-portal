import { requireUser } from '@/lib/auth';
import { PageHead } from '@/components/ui';
import TemplatesAdmin, { type Tpl } from './TemplatesAdmin';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const { supabase } = await requireUser(['doctor', 'admin']);
  const { data } = await supabase.from('letter_templates').select('id, title, body, letter_type').order('title');
  return (
    <>
      <PageHead title="תבניות למכתבים" sub="פסקאות שחוזרות על עצמן: בדיקה תקינה, דיון, המלצות. בתוך המכתב: כפתור ״תבניות״ מכניס אותן בלחיצה." />
      <TemplatesAdmin list={(data as Tpl[] | null) ?? []} />
    </>
  );
}
