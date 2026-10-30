import { requireUser } from '@/lib/auth';
import { PageHead } from '@/components/ui';
import UsersAdmin, { type FirmRow, type SvcRow, type UserRow } from './UsersAdmin';
import PendingSignups, { type Pending } from './PendingSignups';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const { supabase, profile } = await requireUser(['admin']);
  const [{ data: firms }, { data: users }, { data: services }, { data: fp }] = await Promise.all([
    supabase.from('firms').select('id, name, kind, tax_id, contact_name, phone, email, active, book_code, self_registered, approved_at, license_no, signup_note, created_at').order('name'),
    supabase.from('profiles').select('id, role, firm_id, full_name, email, must_change_password, active').order('full_name'),
    supabase.from('services').select('id, label, price, active').order('sort').order('label'),
    supabase.from('firm_prices').select('firm_id, service_id, price'),
  ]);
  const prices: Record<string, Record<string, number>> = {};
  for (const x of (fp as { firm_id: string; service_id: string; price: number }[] | null) ?? []) (prices[x.firm_id] ??= {})[x.service_id] = Number(x.price);
  const all = (firms as (FirmRow & Pending)[] | null) ?? [];
  const isPending = (f: { self_registered?: boolean; approved_at?: string | null; active: boolean }) => !!f.self_registered && !f.approved_at && !f.active;
  const pending = all.filter(isPending).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const rest = all.filter((f) => !isPending(f));
  return (
    <>
      <PageHead title="מפנים ומשתמשים" sub="כל מפנה עם הפרטים, המשתמשים והמחירון שלו. רק מי שמאושר כאן יכול להיכנס." />
      <PendingSignups list={pending} />
      <UsersAdmin firms={rest} users={(users as UserRow[]) ?? []} me={profile.id} services={((services as SvcRow[] | null) ?? []).map((x) => ({ ...x, price: Number(x.price) }))} prices={prices} />
    </>
  );
}
