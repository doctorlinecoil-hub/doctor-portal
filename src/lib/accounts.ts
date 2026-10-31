import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { headers } from 'next/headers';
import { createAdminClient } from './supabase/admin';
import { EMAIL_RE, KIND, SETTINGS_DEFAULTS, notifyList, type Settings } from './constants';
import { appUrl, mailEnabled, sendMail } from './mail';
import { accountApprovedEmail, accountRejectedEmail, loginCodeEmail, signupReceivedEmail, signupStaffEmail, resetLinkEmail } from './emails';

/*
 * Accounts that people open by themselves: law offices, brokers, companies and patients.
 * A new account waits for the clinic's approval (the user is blocked until then).
 * Forgot password: a one-time link by email (30 minutes); the password changes only when its owner opens it.
 * Runs with the service key: every input is checked here.
 */

export type SignupKind = 'law' | 'broker' | 'company' | 'patient';
export type SignupInput = {
  kind: SignupKind; org: string; name: string; phone: string; email: string; password: string;
  idNumber?: string; licenseNo?: string; note?: string; terms: boolean; website?: string;
};
type R = { ok: true; info?: string } | { ok: false; error: string };

const BAN = '876000h';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const clean = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

async function who() {
  const h = await headers();
  const ip = (h.get('x-forwarded-for') || h.get('x-real-ip') || '').split(',')[0].trim() || 'unknown';
  return sha('ip:' + ip).slice(0, 32);
}

async function settings(db: ReturnType<typeof createAdminClient>) {
  const { data } = await db.from('settings').select('*').eq('id', 1).single();
  return { ...SETTINGS_DEFAULTS, ...(data as Settings) } as Settings;
}

async function limited(db: ReturnType<typeof createAdminClient>, action: string, key: string, max: number, extra?: Record<string, string>) {
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from('audit_log').select('id', { count: 'exact', head: true }).eq('action', action).gte('at', hourAgo).contains('details', { k: key });
  if ((count ?? 0) >= max) return true;
  await db.from('audit_log').insert({ user_id: null, action, entity: 'account', entity_id: null, details: { k: key, ...extra } });
  return false;
}

async function staffEmails(db: ReturnType<typeof createAdminClient>, s: Settings) {
  if (notifyList(s).length) return notifyList(s);
  const { data } = await db.from('profiles').select('email, role').in('role', ['doctor', 'admin']).eq('active', true);
  return (data ?? []).map((r) => r.email as string);
}

export async function signup(input: SignupInput): Promise<R> {
  if (input.website) return { ok: false, error: 'הבקשה נחסמה.' };
  const db = createAdminClient();
  const s = await settings(db);
  if (s.open_registration === false) return { ok: false, error: 'ההרשמה למערכת סגורה כרגע. פנו למרפאה.' };
  if (await limited(db, 'signup', await who(), 5)) return { ok: false, error: 'נרשמו הרבה חשבונות מהכתובת הזו. נסו שוב בעוד שעה.' };

  const kind: SignupKind = (['law', 'broker', 'company', 'patient'] as const).includes(input.kind) ? input.kind : 'law';
  const v = {
    org: clean(input.org, 160), name: clean(input.name, 120), phone: clean(input.phone, 40), email: clean(input.email, 200).toLowerCase(),
    id: clean(input.idNumber, 20).replace(/\D/g, ''), license: clean(input.licenseNo, 40), note: clean(input.note, 1000),
  };
  const miss: string[] = [];
  if (kind !== 'patient' && v.org.length < 2) miss.push(kind === 'law' ? 'שם המשרד' : kind === 'broker' ? 'שם העסק' : 'שם החברה');
  if (v.name.length < 2) miss.push('שם מלא');
  if (v.phone.replace(/\D/g, '').length < 9) miss.push('טלפון');
  if (!EMAIL_RE.test(v.email)) miss.push('מייל תקין');
  if (typeof input.password !== 'string' || input.password.length < 10 || input.password.length > 200) miss.push('סיסמה של 10 תווים לפחות');
  if (kind === 'patient' && v.id.length < 5) miss.push('תעודת זהות');
  if (!input.terms) miss.push('אישור תנאי השימוש ומדיניות הפרטיות');
  if (miss.length) return { ok: false, error: 'חסר: ' + miss.join(', ') };

  const { data: exists } = await db.from('profiles').select('id').eq('email', v.email).maybeSingle();
  if (exists) return { ok: false, error: 'המייל הזה כבר רשום במערכת. אפשר להיכנס עם קוד שנשלח למייל, בלי סיסמה.' };

  const { data: firm, error: fErr } = await db.from('firms').insert({
    name: kind === 'patient' ? v.name : v.org, kind, contact_name: v.name, phone: v.phone, email: v.email,
    tax_id: kind === 'patient' ? '' : '', license_no: v.license, signup_note: [kind === 'patient' && v.id ? `ת.ז. ${v.id}` : '', v.note].filter(Boolean).join(' · ').slice(0, 1000),
    active: false, self_registered: true,
  }).select('id').single();
  if (fErr || !firm) return { ok: false, error: 'לא הצלחנו לשמור את ההרשמה. נסו שוב.' };

  const { data: u, error: uErr } = await db.auth.admin.createUser({ email: v.email, password: input.password, email_confirm: true, ban_duration: BAN, user_metadata: { full_name: v.name } });
  if (uErr || !u.user) {
    await db.from('firms').delete().eq('id', firm.id);
    const m = (uErr?.message || '').toLowerCase();
    return { ok: false, error: m.includes('already') ? 'המייל הזה כבר רשום במערכת.' : m.includes('weak') || m.includes('password') ? 'הסיסמה חלשה מדי. בחרו סיסמה ארוכה יותר.' : 'לא הצלחנו ליצור את החשבון. נסו שוב.' };
  }
  const { error: pErr } = await db.from('profiles').insert({ id: u.user.id, role: 'firm', firm_id: firm.id, full_name: v.name, email: v.email, must_change_password: false, active: false });
  if (pErr) {
    await db.auth.admin.deleteUser(u.user.id);
    await db.from('firms').delete().eq('id', firm.id);
    return { ok: false, error: 'לא הצלחנו ליצור את החשבון. נסו שוב.' };
  }

  // the clinic hears about it (bell + email); the new user gets a confirmation
  const { data: staff } = await db.from('profiles').select('id').in('role', ['doctor', 'admin']).eq('active', true);
  if (staff?.length) {
    await db.from('notifications').insert(staff.map((p) => ({ user_id: p.id, kind: 'signup', title: 'הרשמה חדשה ממתינה לאישור', body: `${KIND[kind]} · ${kind === 'patient' ? v.name : v.org}`.slice(0, 500), link: '/admin/users#pending' })));
  }
  const to = await staffEmails(db, s);
  if (to.length) await sendMail(db, null, 'signup_staff', { to, ...signupStaffEmail(s, { name: v.name, org: kind === 'patient' ? '' : v.org, kind: KIND[kind], email: v.email, phone: v.phone }, `${appUrl()}/admin/users#pending`) });
  await sendMail(db, null, 'signup_received', { to: [v.email], ...signupReceivedEmail(s, v.name) });
  return { ok: true };
}

/** Clinic (admin): open the account. */
export async function approveSignup(firmId: string): Promise<R> {
  const db = createAdminClient();
  const s = await settings(db);
  const { data: firm } = await db.from('firms').update({ active: true, approved_at: new Date().toISOString() }).eq('id', firmId).select('id').maybeSingle();
  if (!firm) return { ok: false, error: 'החשבון לא נמצא.' };
  const { data: users } = await db.from('profiles').select('id, full_name, email').eq('firm_id', firmId);
  for (const u of users ?? []) {
    await db.auth.admin.updateUserById(u.id, { ban_duration: 'none' });
    await db.from('profiles').update({ active: true }).eq('id', u.id);
    await sendMail(db, null, 'account_approved', { to: [u.email], ...accountApprovedEmail(s, u.full_name, u.email) });
  }
  return { ok: true, info: mailEnabled() ? 'החשבון אושר ונשלח מייל למשתמש.' : 'החשבון אושר. (שליחת מיילים עוד לא הופעלה: עדכנו את המשתמש בטלפון.)' };
}

/** Clinic (admin): turn the request down and remove it. */
export async function rejectSignup(firmId: string, reason: string): Promise<R> {
  const db = createAdminClient();
  const s = await settings(db);
  const { data: firm } = await db.from('firms').select('id, self_registered, approved_at').eq('id', firmId).maybeSingle();
  if (!firm || !firm.self_registered || firm.approved_at) return { ok: false, error: 'אפשר לדחות רק הרשמה שממתינה לאישור.' };
  const { count } = await db.from('appointments').select('id', { count: 'exact', head: true }).eq('firm_id', firmId);
  const { data: users } = await db.from('profiles').select('id, full_name, email').eq('firm_id', firmId);
  for (const u of users ?? []) {
    await sendMail(db, null, 'account_rejected', { to: [u.email], ...accountRejectedEmail(s, u.full_name, clean(reason, 300)) });
    await db.from('profiles').delete().eq('id', u.id);
    await db.auth.admin.deleteUser(u.id);
  }
  if (!count) await db.from('firms').delete().eq('id', firmId);
  return { ok: true, info: 'ההרשמה נדחתה.' };
}

/** Forgot password: a one-time link by email. The answer never says whether the address is registered. */
export async function forgotPassword(emailRaw: string): Promise<R> {
  const email = clean(emailRaw, 200).toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'כתובת המייל לא תקינה.' };
  if (!mailEnabled()) return { ok: false, error: 'שליחת מיילים עוד לא הופעלה במרפאה. פנו למרפאה לאיפוס הסיסמה.' };
  const db = createAdminClient();
  const generic: R = { ok: true, info: 'אם המייל רשום במערכת, נשלח אליו קישור לבחירת סיסמה חדשה (תקף ל־30 דקות). בדקו גם בתיקיית הספאם.' };
  if (await limited(db, 'forgot', await who(), 8)) return { ok: false, error: 'יותר מדי בקשות. נסו שוב בעוד שעה.' };
  if (await limited(db, 'forgot_email', sha('mail:' + email).slice(0, 32), 3)) return generic;
  // exact match only (no patterns)
  const { data: p } = await db.from('profiles').select('id, full_name, email, active').eq('email', email).maybeSingle();
  if (!p || !p.active || String(p.email).toLowerCase() !== email) return generic;
  const s = await settings(db);
  const token = randomBytes(32).toString('base64url');
  await db.from('password_resets').delete().eq('user_id', p.id).is('used_at', null);
  const { error } = await db.from('password_resets').insert({ user_id: p.id, token_hash: sha('reset:' + token), expires_at: new Date(Date.now() + 30 * 60_000).toISOString() });
  if (error) return generic;
  await sendMail(db, null, 'password_reset', { to: [p.email], ...resetLinkEmail(s, p.full_name || '', `${appUrl()}/forgot/reset?t=${token}`) });
  return generic;
}

/** Is a reset link still good (for the page, before the form is shown)? */
export async function resetLinkOk(token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token || '')) return false;
  const db = createAdminClient();
  const { data } = await db.from('password_resets').select('expires_at, used_at').eq('token_hash', sha('reset:' + token)).maybeSingle();
  return !!data && !data.used_at && new Date(data.expires_at).getTime() > Date.now();
}

/** Sets the new password from a reset link (once). */
export async function resetPassword(token: string, password: string): Promise<R> {
  if (typeof password !== 'string' || password.length < 10 || password.length > 200) return { ok: false, error: 'הסיסמה צריכה להיות באורך 10 תווים לפחות.' };
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token || '')) return { ok: false, error: 'הקישור לא תקין. בקשו קישור חדש.' };
  const db = createAdminClient();
  if (await limited(db, 'reset_try', await who(), 20)) return { ok: false, error: 'יותר מדי ניסיונות. נסו שוב בעוד שעה.' };
  // claim the link atomically: only one request can use it
  const { data: row } = await db.from('password_resets').update({ used_at: new Date().toISOString() })
    .eq('token_hash', sha('reset:' + token)).is('used_at', null).gt('expires_at', new Date().toISOString())
    .select('user_id').maybeSingle();
  if (!row) return { ok: false, error: 'הקישור פג תוקף או שכבר נעשה בו שימוש. בקשו קישור חדש.' };
  const { data: p } = await db.from('profiles').select('active').eq('id', row.user_id).maybeSingle();
  if (!p?.active) return { ok: false, error: 'החשבון לא פעיל. פנו למרפאה.' };
  const { error } = await db.auth.admin.updateUserById(row.user_id, { password });
  if (error) return { ok: false, error: error.message.toLowerCase().includes('weak') ? 'הסיסמה חלשה מדי. בחרו סיסמה ארוכה יותר.' : 'לא הצלחנו לשמור את הסיסמה. בקשו קישור חדש.' };
  await db.from('profiles').update({ must_change_password: false }).eq('id', row.user_id);
  await db.from('password_resets').delete().eq('user_id', row.user_id).is('used_at', null);
  await db.from('audit_log').insert({ user_id: row.user_id, action: 'password_reset', entity: 'profile', entity_id: row.user_id, details: {} });
  return { ok: true, info: 'הסיסמה עודכנה. אפשר להתחבר.' };
}

/**
 * Sign-in by email: a one-time code (and link) to an active account's address. The code is Supabase's own
 * one-time password (generated here, sent through the clinic's mail), so the session is a normal sign-in.
 */
export async function sendLoginCode(emailRaw: string): Promise<R> {
  const email = clean(emailRaw, 200).toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'כתובת המייל לא תקינה.' };
  if (!mailEnabled()) return { ok: false, error: 'שליחת מיילים עוד לא הופעלה. היכנסו עם סיסמה.' };
  const db = createAdminClient();
  const generic: R = { ok: true, info: 'אם המייל רשום במערכת, נשלח אליו קוד כניסה (תקף לשעה). בדקו גם בתיקיית הספאם.' };
  if (await limited(db, 'login_code', await who(), 10)) return { ok: false, error: 'יותר מדי בקשות. נסו שוב בעוד שעה.' };
  if (await limited(db, 'login_code_email', sha('mail:' + email).slice(0, 32), 5)) return generic;
  const { data: p } = await db.from('profiles').select('id, full_name, email, active').eq('email', email).maybeSingle();
  if (!p || !p.active || String(p.email).toLowerCase() !== email) return generic;
  const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email });
  const code = data?.properties?.email_otp, hashed = data?.properties?.hashed_token;
  if (error || !code || !hashed) return generic;
  const s = await settings(db);
  await sendMail(db, null, 'login_code', { to: [p.email], ...loginCodeEmail(s, p.full_name || '', code, `${appUrl()}/auth/confirm?token_hash=${encodeURIComponent(hashed)}&type=magiclink`) });
  return generic;
}
