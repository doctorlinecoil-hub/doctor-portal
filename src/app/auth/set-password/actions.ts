'use server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/** Changes the signed-in user's password and clears the "temporary password" flag in one step. */
export async function changePassword(password: string): Promise<{ ok: boolean; error?: string }> {
  if (typeof password !== 'string' || password.length < 10 || password.length > 200) return { ok: false, error: 'הסיסמה צריכה להיות באורך 10 תווים לפחות.' };
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return { ok: false, error: 'צריך להתחבר מחדש.' };
  const { data: profile } = await supabase.from('profiles').select('role, active').eq('id', claims.sub).maybeSingle();
  if (!profile?.active) return { ok: false, error: 'אין גישה.' };
  if (profile.role !== 'firm' && claims.aal !== 'aal2') {
    const { data: s } = await supabase.from('settings').select('require_staff_mfa').eq('id', 1).maybeSingle();
    if (s?.require_staff_mfa !== false) return { ok: false, error: 'צריך קודם להזין את הקוד מהטלפון.' };
  }
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(claims.sub, { password });
  if (error) return { ok: false, error: error.message.toLowerCase().includes('weak') ? 'הסיסמה חלשה מדי. בחרו סיסמה ארוכה יותר.' : 'לא הצלחנו לשמור את הסיסמה. נסו סיסמה אחרת.' };
  await admin.from('profiles').update({ must_change_password: false }).eq('id', claims.sub);
  return { ok: true };
}
