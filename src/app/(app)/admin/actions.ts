'use server';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { deliverLetter } from '@/lib/notify';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { tempPassword } from '@/lib/password';
import { issueReceipt, morningEnabled, type ChequeInfo } from '@/lib/morning';
import { EMAIL_RE, PAY_METHODS, TYPES, type Payer, type PayMethod, type ReferralType, type ReferrerKind, type WeekDay } from '@/lib/constants';

type Result = { ok: boolean; error?: string; email?: string; password?: string; info?: string };

async function assertAdmin() {
  const supabase = await createClient();
  const { data } = await supabase.rpc('is_admin');
  if (!data) throw new Error('FORBIDDEN');
  return supabase;
}

const HM = /^\d{2}:\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;
const clean = (s: unknown, n = 2000) => String(s ?? '').trim().slice(0, n);
const money = (n: unknown) => Math.round(Number(n) * 100) / 100;

export async function saveSettings(input: {
  weekly: Record<string, WeekDay>; slot_minutes: number; horizon_days: number; notice_hours: number; blocked_dates: string[];
  require_staff_mfa: boolean; max_open_per_firm: number; prices: Record<ReferralType, number>; letter_requires_payment: boolean; invoice_item: string;
  lh_name: string; lh_titles: string; lh_licenses: string; lh_address: string; lh_phone: string; lh_email: string; lh_education: string;
  require_approval: boolean; notify_email: string; bring_items: string; summons_note: string; reminders_on: boolean; email_letters: boolean; auto_intake: boolean;
}): Promise<Result> {
  const supabase = await assertAdmin().catch(() => null);
  if (!supabase) return { ok: false, error: 'אין הרשאה.' };
  const weekly: Record<string, WeekDay> = {};
  for (let i = 0; i < 7; i++) {
    const d = input.weekly[String(i)];
    if (!d || !HM.test(d.from) || !HM.test(d.to)) return { ok: false, error: 'שעה לא תקינה.' };
    if (d.on && d.from >= d.to) return { ok: false, error: 'שעת הסיום צריכה להיות אחרי שעת ההתחלה.' };
    weekly[String(i)] = { on: !!d.on, from: d.from, to: d.to };
  }
  const notifyEmail = clean(input.notify_email, 200).toLowerCase();
  if (notifyEmail && !EMAIL_RE.test(notifyEmail)) return { ok: false, error: 'כתובת המייל להתראות לא תקינה.' };
  const prices = Object.fromEntries((Object.keys(TYPES) as ReferralType[]).map((k) => [k, Math.max(0, Math.min(999999, money(input.prices?.[k] || 0)))]));
  const { error } = await supabase.from('settings').update({
    weekly,
    slot_minutes: Math.min(240, Math.max(10, Math.round(+input.slot_minutes || 30))),
    horizon_days: Math.min(180, Math.max(1, Math.round(+input.horizon_days || 30))),
    notice_hours: Math.min(336, Math.max(0, Math.round(+input.notice_hours || 0))),
    blocked_dates: (input.blocked_dates || []).filter((d) => DATE.test(d)).sort(),
    require_staff_mfa: !!input.require_staff_mfa,
    max_open_per_firm: Math.min(500, Math.max(1, Math.round(+input.max_open_per_firm || 30))),
    prices,
    letter_requires_payment: !!input.letter_requires_payment,
    invoice_item: clean(input.invoice_item, 120) || 'ייעוץ רפואי',
    lh_name: clean(input.lh_name, 120) || 'ד״ר אלרן חנוך',
    lh_titles: clean(input.lh_titles), lh_licenses: clean(input.lh_licenses, 200), lh_address: clean(input.lh_address, 300),
    lh_phone: clean(input.lh_phone, 40), lh_email: clean(input.lh_email, 120), lh_education: clean(input.lh_education, 4000),
    require_approval: !!input.require_approval,
    notify_email: notifyEmail,
    bring_items: clean(input.bring_items, 2000),
    summons_note: clean(input.summons_note, 2000),
    reminders_on: !!input.reminders_on,
    email_letters: !!input.email_letters,
    auto_intake: !!input.auto_intake,
  }).eq('id', 1);
  if (error) return { ok: false, error: 'השמירה נכשלה.' };
  revalidatePath('/', 'layout');
  return { ok: true };
}

/* ---------- users and referrers ---------- */

async function createUser(email: string, name: string, role: 'admin' | 'doctor' | 'firm', firmId: string | null): Promise<Result> {
  email = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: 'אימייל לא תקין.' };
  const admin = createAdminClient();
  const password = tempPassword();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
  if (error || !data.user) return { ok: false, error: error?.message?.includes('already') ? 'המייל הזה כבר רשום במערכת.' : 'לא הצלחנו ליצור את המשתמש.' };
  const { error: pErr } = await admin.from('profiles').insert({ id: data.user.id, role, firm_id: firmId, full_name: name.trim(), email, must_change_password: true });
  if (pErr) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { ok: false, error: 'לא הצלחנו לשמור את פרטי המשתמש.' };
  }
  return { ok: true, email, password };
}

type FirmInput = { name: string; kind: ReferrerKind; taxId: string; contactName: string; phone: string; firmEmail: string };

function firmRow(i: FirmInput) {
  return {
    name: clean(i.name, 160), kind: i.kind === 'broker' ? 'broker' : 'law', tax_id: clean(i.taxId, 20).replace(/[^\d]/g, ''),
    contact_name: clean(i.contactName, 120), phone: clean(i.phone, 40), email: clean(i.firmEmail, 120),
  };
}

export async function createFirm(input: FirmInput & { userName: string; userEmail: string }): Promise<Result> {
  if (!(await assertAdmin().catch(() => null))) return { ok: false, error: 'אין הרשאה.' };
  if (clean(input.name).length < 2) return { ok: false, error: 'מלאו שם.' };
  if (!clean(input.userName)) return { ok: false, error: 'מלאו את שם המשתמש הראשון.' };
  const admin = createAdminClient();
  const { data: firm, error } = await admin.from('firms').insert(firmRow(input)).select('id').single();
  if (error || !firm) return { ok: false, error: 'לא הצלחנו ליצור את המפנה.' };
  const r = await createUser(input.userEmail, input.userName, 'firm', firm.id);
  if (!r.ok) await admin.from('firms').delete().eq('id', firm.id);
  revalidatePath('/admin/users');
  return r;
}

export async function updateFirm(firmId: string, input: FirmInput): Promise<Result> {
  const supabase = await assertAdmin().catch(() => null);
  if (!supabase) return { ok: false, error: 'אין הרשאה.' };
  if (!UUID.test(firmId) || clean(input.name).length < 2) return { ok: false, error: 'מלאו שם.' };
  const { error } = await supabase.from('firms').update(firmRow(input)).eq('id', firmId);
  if (error) return { ok: false, error: 'השמירה נכשלה.' };
  revalidatePath('/admin/users');
  return { ok: true };
}

export async function addUser(input: { firmId: string | null; role: 'admin' | 'doctor' | 'firm'; name: string; email: string }): Promise<Result> {
  if (!(await assertAdmin().catch(() => null))) return { ok: false, error: 'אין הרשאה.' };
  if (!clean(input.name)) return { ok: false, error: 'מלאו שם.' };
  if (input.role === 'firm' && !input.firmId) return { ok: false, error: 'בחרו מפנה.' };
  const r = await createUser(input.email, input.name, input.role, input.role === 'firm' ? input.firmId : null);
  revalidatePath('/admin/users');
  return r;
}

export async function resetPassword(userId: string): Promise<Result> {
  if (!(await assertAdmin().catch(() => null))) return { ok: false, error: 'אין הרשאה.' };
  const admin = createAdminClient();
  const password = tempPassword();
  const { data, error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return { ok: false, error: 'לא הצלחנו לאפס את הסיסמה.' };
  await admin.from('profiles').update({ must_change_password: true }).eq('id', userId);
  revalidatePath('/admin/users');
  return { ok: true, email: data.user?.email, password };
}

export async function resetTwoStep(userId: string): Promise<Result> {
  if (!(await assertAdmin().catch(() => null))) return { ok: false, error: 'אין הרשאה.' };
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId });
  if (error) return { ok: false, error: 'לא הצלחנו לאפס את האימות.' };
  for (const f of data?.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId });
  return { ok: true, info: 'האימות אופס. בכניסה הבאה המשתמש יגדיר אותו מחדש.' };
}

export async function setUserActive(userId: string, active: boolean): Promise<Result> {
  const supabase = await assertAdmin().catch(() => null);
  if (!supabase) return { ok: false, error: 'אין הרשאה.' };
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims.sub === userId && !active) return { ok: false, error: 'אי אפשר לחסום את עצמך.' };
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: active ? 'none' : '876000h' });
  if (error) return { ok: false, error: 'הפעולה נכשלה.' };
  await admin.from('profiles').update({ active }).eq('id', userId);
  revalidatePath('/admin/users');
  return { ok: true };
}

export async function setFirmActive(firmId: string, active: boolean): Promise<Result> {
  if (!(await assertAdmin().catch(() => null))) return { ok: false, error: 'אין הרשאה.' };
  const admin = createAdminClient();
  const { error } = await admin.from('firms').update({ active }).eq('id', firmId);
  if (error) return { ok: false, error: 'הפעולה נכשלה.' };
  // block or unblock every user of the referrer as well
  const { data: users } = await admin.from('profiles').select('id').eq('firm_id', firmId);
  for (const u of users ?? []) {
    await admin.auth.admin.updateUserById(u.id, { ban_duration: active ? 'none' : '876000h' });
    await admin.from('profiles').update({ active }).eq('id', u.id);
  }
  revalidatePath('/admin/users');
  return { ok: true };
}

/* ---------- billing and payments ---------- */

export async function updateBilling(appointmentId: string, input: { price: number; payer: Payer }): Promise<Result> {
  const supabase = await assertAdmin().catch(() => null);
  if (!supabase) return { ok: false, error: 'אין הרשאה.' };
  const price = money(input.price);
  if (!UUID.test(appointmentId) || !(price >= 0 && price < 1000000)) return { ok: false, error: 'מחיר לא תקין.' };
  const { error } = await supabase.from('appointments').update({ price, payer: input.payer === 'patient' ? 'patient' : 'referrer' }).eq('id', appointmentId);
  if (error) return { ok: false, error: 'השמירה נכשלה.' };
  revalidatePath(`/doctor/cases/${appointmentId}`);
  revalidatePath('/admin/payments');
  return { ok: true };
}

async function issueFor(supabase: Awaited<ReturnType<typeof createClient>>, paymentId: string, sendEmail: boolean, cheque?: ChequeInfo): Promise<string | null> {
  const { data: p } = await supabase.from('payments').select('id, amount, method, paid_on, receipt_no, appointment_id').eq('id', paymentId).single();
  if (!p) return 'התשלום לא נמצא.';
  if (p.receipt_no) return 'לתשלום הזה כבר יש קבלה.';
  const { data: a } = await supabase.from('appointments')
    .select('case_no, patient_name, patient_id_number, patient_phone, payer, firm:firms(name, tax_id, email, phone)').eq('id', p.appointment_id).single();
  const { data: s } = await supabase.from('settings').select('invoice_item').eq('id', 1).single();
  if (!a) return 'התיק לא נמצא.';
  const firm = a.firm as unknown as { name: string; tax_id: string; email: string; phone: string } | null;
  const client = a.payer === 'patient'
    ? { name: a.patient_name, taxId: a.patient_id_number, phone: a.patient_phone }
    : { name: firm?.name || '', taxId: firm?.tax_id || undefined, email: firm?.email || undefined, phone: firm?.phone || undefined };
  try {
    const doc = await issueReceipt({
      client, sendEmail, cheque,
      description: s?.invoice_item || 'ייעוץ רפואי',
      remarks: `תיק ${a.case_no} · ${a.patient_name}`,
      amount: Number(p.amount), method: p.method as PayMethod, date: p.paid_on,
    });
    await supabase.from('payments').update({ receipt_no: doc.number, receipt_url: doc.url, invoice_id: doc.id, invoice_error: '' }).eq('id', paymentId);
    return null;
  } catch (e) {
    const msg = (e as Error).message.slice(0, 480);
    await supabase.from('payments').update({ invoice_error: msg }).eq('id', paymentId);
    return msg;
  }
}

export async function recordPayment(input: {
  appointmentId: string; amount: number; method: PayMethod; paidOn: string; receiptNo: string; receiptUrl: string; note: string;
  issueInvoice: boolean; sendEmail: boolean; cheque?: ChequeInfo;
}): Promise<Result> {
  const supabase = await assertAdmin().catch(() => null);
  if (!supabase) return { ok: false, error: 'אין הרשאה.' };
  const amount = money(input.amount);
  if (!UUID.test(input.appointmentId)) return { ok: false, error: 'תיק לא תקין.' };
  if (!(amount > 0 && amount < 1000000)) return { ok: false, error: 'סכום לא תקין.' };
  if (!(input.method in PAY_METHODS)) return { ok: false, error: 'בחרו אמצעי תשלום.' };
  if (!DATE.test(input.paidOn)) return { ok: false, error: 'תאריך לא תקין.' };
  const receiptUrl = clean(input.receiptUrl, 500);
  if (receiptUrl && !receiptUrl.startsWith('https://')) return { ok: false, error: 'קישור לקבלה צריך להתחיל ב־https://' };
  if (input.issueInvoice && !morningEnabled()) return { ok: false, error: 'החיבור למורנינג עוד לא הוגדר.' };
  const { data, error } = await supabase.from('payments').insert({
    appointment_id: input.appointmentId, amount, method: input.method, paid_on: input.paidOn,
    receipt_no: input.issueInvoice ? '' : clean(input.receiptNo, 60), receipt_url: input.issueInvoice ? '' : receiptUrl, note: clean(input.note, 500),
  }).select('id').single();
  if (error || !data) return { ok: false, error: 'רישום התשלום נכשל.' };
  let info = 'התשלום נרשם';
  if (input.issueInvoice) {
    const err = await issueFor(supabase, data.id, input.sendEmail, input.cheque);
    info = err ? `התשלום נרשם, אבל החשבונית לא הופקה: ${err}` : 'התשלום נרשם והחשבונית הופקה במורנינג';
  }
  // a letter that waited for payment goes out by itself once the case is paid in full
  after(() => deliverLetter(input.appointmentId, { onlyIfAwaitingPayment: true }).then(() => undefined).catch(() => undefined));
  revalidatePath(`/doctor/cases/${input.appointmentId}`);
  revalidatePath('/admin/payments');
  return { ok: true, info };
}

export async function issueInvoice(paymentId: string, sendEmail: boolean): Promise<Result> {
  const supabase = await assertAdmin().catch(() => null);
  if (!supabase) return { ok: false, error: 'אין הרשאה.' };
  if (!morningEnabled()) return { ok: false, error: 'החיבור למורנינג עוד לא הוגדר.' };
  const err = await issueFor(supabase, paymentId, sendEmail);
  revalidatePath('/admin/payments');
  revalidatePath('/doctor/cases/[id]', 'page');
  return err ? { ok: false, error: err } : { ok: true, info: 'החשבונית הופקה' };
}

export async function deletePayment(paymentId: string): Promise<Result> {
  const supabase = await assertAdmin().catch(() => null);
  if (!supabase) return { ok: false, error: 'אין הרשאה.' };
  const { data: p } = await supabase.from('payments').select('appointment_id, receipt_no, invoice_id').eq('id', paymentId).single();
  if (!p) return { ok: false, error: 'התשלום לא נמצא.' };
  if (p.invoice_id) return { ok: false, error: 'לתשלום יש חשבונית במורנינג. מבטלים אותה במורנינג (חשבונית זיכוי) ולא כאן.' };
  const { error } = await supabase.from('payments').delete().eq('id', paymentId);
  if (error) return { ok: false, error: 'המחיקה נכשלה.' };
  revalidatePath(`/doctor/cases/${p.appointment_id}`);
  revalidatePath('/admin/payments');
  return { ok: true };
}
