import { requireUser } from '@/lib/auth';
import { PageHead } from '@/components/ui';
import UsersAdmin, { type FirmRow, type UserRow } from './UsersAdmin';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const { supabase, profile } = await requireUser(['admin']);
  const [{ data: firms }, { data: users }] = await Promise.all([
    supabase.from('firms').select('id, name, kind, tax_id, contact_name, phone, email, active, book_code').order('name'),
    supabase.from('profiles').select('id, role, firm_id, full_name, email, must_change_password, active').order('full_name'),
  ]);
  return (
    <>
      <PageHead title="מפנים ומשתמשים" sub="רק מי שמופיע כאן יכול להיכנס. כל מפנה רואה רק את התיקים שלו." />
      <UsersAdmin firms={(firms as FirmRow[]) ?? []} users={(users as UserRow[]) ?? []} me={profile.id} />
    </>
  );
}
