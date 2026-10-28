import { requireUser } from '@/lib/auth';
import AppShell from '@/components/AppShell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile, settings } = await requireUser();
  let orgName: string | undefined;
  if (profile.role === 'firm') {
    const { data } = await supabase.from('firms').select('name').eq('id', profile.firm_id!).maybeSingle();
    orgName = data?.name;
  }
  return (
    <AppShell role={profile.role} userName={profile.full_name || profile.email} orgName={orgName} clinicName={settings?.lh_name || 'ד״ר אלרן חנוך'}>
      {children}
    </AppShell>
  );
}
