import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SETTINGS_DEFAULTS, type Role, type Settings } from '@/lib/constants';

export type Profile = {
  id: string;
  role: Role;
  firm_id: string | null;
  full_name: string;
  email: string;
  must_change_password: boolean;
  active: boolean;
};

export async function getSession() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;
  if (!claims?.sub) return { supabase, claims: null, profile: null as Profile | null };
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', claims.sub).maybeSingle();
  return { supabase, claims, profile: (profile as Profile | null) ?? null };
}

/** Use at the top of every protected page. Redirects when the user may not be here. */
export async function requireUser(roles?: Role[]) {
  const { supabase, claims, profile } = await getSession();
  if (!claims) redirect('/login');
  if (!profile || !profile.active) redirect('/login?e=noaccess');
  const { data: settings } = await supabase.from('settings').select('*').eq('id', 1).single();
  const staff = profile.role === 'admin' || profile.role === 'doctor';
  // staff verify the phone code first, then change a temporary password
  if (staff && (settings as Settings | null)?.require_staff_mfa !== false && claims.aal !== 'aal2') redirect('/mfa');
  if (profile.must_change_password) redirect('/auth/set-password');
  if (profile.role === 'firm') {
    const { data: firm } = await supabase.from('firms').select('id, name').eq('id', profile.firm_id!).maybeSingle();
    if (!firm) redirect('/login?e=noaccess');
  }
  if (roles && !roles.includes(profile.role)) redirect('/');
  return { supabase, claims, profile, settings: { ...SETTINGS_DEFAULTS, ...(settings as Settings) } as Settings, staff };
}

export function homeFor(role: Role) {
  return role === 'firm' ? '/firm' : '/doctor';
}
