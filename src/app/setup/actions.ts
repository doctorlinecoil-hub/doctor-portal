'use server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

export async function createFirstAdmin(_: unknown, form: FormData): Promise<{ ok: boolean; error?: string }> {
  const code = String(form.get('code') || '');
  const name = String(form.get('name') || '').trim();
  const email = String(form.get('email') || '').trim().toLowerCase();
  const password = String(form.get('password') || '');
  const expected = process.env.SETUP_CODE || '';
  const a = Buffer.from(code), b = Buffer.from(expected);
  if (expected.length < 8 || a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, error: 'קוד ההגדרה לא נכון.' };
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: 'מלאו שם ואימייל תקין.' };
  if (password.length < 10) return { ok: false, error: 'הסיסמה צריכה להיות באורך 10 תווים לפחות.' };

  const admin = createAdminClient();
  // claim the one-time setup atomically, so two submissions can't both create an admin
  const { data: claimed } = await admin.from('settings').update({ bootstrapped: true }).eq('id', 1).eq('bootstrapped', false).select('id');
  if (!claimed?.length) return { ok: false, error: 'המערכת כבר הוגדרה.' };
  const release = () => admin.from('settings').update({ bootstrapped: false }).eq('id', 1);

  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
  if (error || !data.user) {
    await release();
    return { ok: false, error: 'לא הצלחנו ליצור את המשתמש. ייתכן שהמייל כבר רשום.' };
  }
  const { error: pErr } = await admin.from('profiles').insert({ id: data.user.id, role: 'admin', full_name: name, email, must_change_password: false });
  if (pErr) {
    await admin.auth.admin.deleteUser(data.user.id);
    await release();
    return { ok: false, error: 'לא הצלחנו לשמור את פרטי המנהל.' };
  }
  return { ok: true };
}
