import { requireUser } from '@/lib/auth';
import { morningEnabled } from '@/lib/morning';
import { PageHead } from '@/components/ui';
import SettingsForm from './SettingsForm';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const { settings } = await requireUser(['admin']);
  return (
    <>
      <PageHead title="הגדרות" sub="זמני קבלה, מחירים, נייר מכתבים ואבטחה" />
      <SettingsForm initial={settings} morning={morningEnabled()} />
    </>
  );
}
