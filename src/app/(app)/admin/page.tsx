import { requireUser } from '@/lib/auth';
import { morningEnabled } from '@/lib/morning';
import { mailEnabled } from '@/lib/mail';
import SettingsForm from './SettingsForm';
import ResetData from './ResetData';
import BackupNow from './BackupNow';
import { smsChannel, smsEnabled } from '@/lib/sms';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const { settings } = await requireUser(['admin']);
  return (
    <>
      <SettingsForm initial={settings} morning={morningEnabled()} mail={mailEnabled()} cron={!!process.env.CRON_SECRET} sms={smsEnabled() ? smsChannel() : ''} />
      <div className="st-maint" id="maintenance">
        <BackupNow />
        <ResetData />
      </div>
    </>
  );
}
