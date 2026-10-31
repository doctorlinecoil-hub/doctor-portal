import { requireUser } from '@/lib/auth';
import { morningEnabled } from '@/lib/morning';
import { mailEnabled } from '@/lib/mail';
import SettingsForm from './SettingsForm';
import type { ReferralType } from '@/lib/constants';
import BackupNow from './BackupNow';
import { smsChannel, smsEnabled } from '@/lib/sms';
import { waEnabled } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const { settings, supabase } = await requireUser(['admin']);
  const { data: svc } = await supabase.from('services').select('id, label, base_type, active').order('sort');
  return (
    <>
      <SettingsForm services={((svc ?? []) as { id: string; label: string; base_type: ReferralType; active: boolean }[]).filter((x) => x.active)} initial={settings} morning={morningEnabled()} mail={mailEnabled()} cron={!!process.env.CRON_SECRET} sms={smsEnabled() ? smsChannel() : ''} wa={waEnabled()} />
      <div className="st-maint" id="maintenance">
        <BackupNow />
      </div>
    </>
  );
}
