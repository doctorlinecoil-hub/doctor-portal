'use server';
import { createHash, randomBytes } from 'node:crypto';
import { after } from 'next/server';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { ACCEPTED_TYPES, BUCKET, EMAIL_RE, MAX_FILE_BYTES, SETTINGS_DEFAULTS, dbError, type Settings } from '@/lib/constants';
import { notifyNewRequest, sendSummons } from '@/lib/notify';
import { runIntake } from '@/lib/intake';
import { autoDraft } from '@/lib/autodraft';

/*
 * The public booking page (no sign-in). Everything runs with the service key, so every input is checked here:
 * a hidden spam field, a per-address and a global hourly limit, the clinic's own booking rules (in the database
 * trigger), and a short-lived key that is the only way to attach documents to the new case.
 */

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const clean = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

async function clientKey() {
  const h = await headers();
  const ip = (h.get('x-forwarded-for') || h.get('x-real-ip') || '').split(',')[0].trim() || 'unknown';
  return sha('ip:' + ip).slice(0, 32);
}

export type PublicBookingInput = {
  code?: string;
  serviceId: string;
  slot: string;
  referrer: { kind: 'law' | 'broker' | 'private'; office: string; contact: string; phone: string; email: string };
  patient: { name: string; idNumber: string; dob: string; phone: string; email: string };
  payer: 'patient' | 'referrer';
  notes: string;
  /** must stay empty (a field people don't see) */
  website?: string;
};

export async function publicBook(input: PublicBookingInput): Promise<R<{ id: string; caseNo: number; pending: boolean; key: string }>> {
  if (input.website) return { ok: false, error: 'הבקשה נחסמה.' };
  const db = createAdminClient();
  const { data: s0 } = await db.from('settings').select('*').eq('id', 1).single();
  const s = { ...SETTINGS_DEFAULTS, ...(s0 as Settings) } as Settings & { public_booking?: boolean };
  if (s.public_booking === false) return { ok: false, error: 'קביעת תור מקוונת סגורה כרגע. צרו קשר עם המרפאה.' };

  // limits: 5 bookings an hour from one address, 60 an hour overall
  const who = await clientKey();
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const [{ count: mine }, { count: all }] = await Promise.all([
    db.from('audit_log').select('id', { count: 'exact', head: true }).eq('action', 'public_book').gte('at', hourAgo).contains('details', { who }),
    db.from('audit_log').select('id', { count: 'exact', head: true }).eq('action', 'public_book').gte('at', hourAgo),
  ]);
  if ((mine ?? 0) >= 5 || (all ?? 0) >= 60) return { ok: false, error: 'נקבעו הרבה תורים בזמן קצר. נסו שוב בעוד שעה או צרו קשר עם המרפאה.' };

  // the details
  const p = input.patient;
  const r = input.referrer;
  const pat = { name: clean(p.name, 120), id: clean(p.idNumber, 20).replace(/\D/g, ''), dob: /^\d{4}-\d{2}-\d{2}$/.test(p.dob) ? p.dob : null, phone: clean(p.phone, 30), email: clean(p.email, 200).toLowerCase() };
  const miss: string[] = [];
  if (!UUID.test(input.serviceId)) miss.push('סוג השירות');
  if (!input.slot || Number.isNaN(Date.parse(input.slot))) miss.push('מועד');
  if (pat.name.length < 2) miss.push('שם המטופל');
  if (pat.id.length < 5) miss.push('תעודת זהות');
  if (pat.phone.replace(/\D/g, '').length < 9) miss.push('טלפון המטופל');
  if (pat.email && !EMAIL_RE.test(pat.email)) miss.push('מייל מטופל תקין');

  // who is booking: a personal link, an existing office (by email), a new office, or the patient
  let firmId = '';
  let firmEmail = '';
  if (input.code && /^[a-z0-9]{6,20}$/.test(input.code)) {
    const { data: f } = await db.from('firms').select('id, email, active').eq('book_code', input.code).maybeSingle();
    if (!f || !f.active) return { ok: false, error: 'הקישור לא תקף. בקשו מהמרפאה קישור חדש.' };
    firmId = f.id;
    firmEmail = f.email;
  } else if (r.kind === 'private') {
    const { data: f } = await db.from('firms').select('id').eq('kind', 'private').eq('active', true).order('created_at').limit(1).maybeSingle();
    if (!f) return { ok: false, error: 'קביעת תור עצמאית לא זמינה כרגע. צרו קשר עם המרפאה.' };
    firmId = f.id;
    if (!pat.email) miss.push('מייל המטופל (לשם יישלח הזימון)');
  } else {
    const office = clean(r.office, 160);
    const contact = clean(r.contact, 120);
    const email = clean(r.email, 200).toLowerCase();
    const phone = clean(r.phone, 40);
    if (office.length < 2) miss.push(r.kind === 'broker' ? 'שם המשרד / המתווך' : 'שם המשרד');
    if (contact.length < 2) miss.push('איש קשר');
    if (!EMAIL_RE.test(email)) miss.push('מייל המפנה');
    if (phone.replace(/\D/g, '').length < 9) miss.push('טלפון המפנה');
    if (!miss.length) {
      const { data: same } = await db.from('firms').select('id, active').ilike('email', email).limit(1).maybeSingle();
      if (same?.active) firmId = same.id;
      else {
        const { data: f, error } = await db.from('firms').insert({ name: office, kind: r.kind === 'broker' ? 'broker' : 'law', contact_name: contact, phone, email }).select('id').single();
        if (error || !f) return { ok: false, error: 'לא הצלחנו לשמור את פרטי המפנה.' };
        firmId = f.id;
      }
      firmEmail = email;
    }
  }
  if (miss.length) return { ok: false, error: 'חסר: ' + miss.join(', ') };

  const key = randomBytes(24).toString('hex');
  const { data: a, error } = await db.from('appointments').insert({
    firm_id: firmId, starts_at: input.slot, service_id: input.serviceId,
    patient_name: pat.name, patient_id_number: pat.id, patient_dob: pat.dob, patient_phone: pat.phone, patient_email: pat.email,
    payer: input.payer === 'referrer' && r.kind !== 'private' ? 'referrer' : 'patient',
    notes: clean(input.notes, 5000), submitted_by: clean(r.contact, 120), source: 'public',
    upload_key_hash: sha(key), upload_key_expires: new Date(Date.now() + 3 * 3600_000).toISOString(),
  }).select('id, case_no, status').single();
  if (error || !a) {
    if (error?.code === '23505' || error?.code === '23P01') return { ok: false, error: 'המועד הזה נתפס הרגע. בחרו מועד אחר.' };
    return { ok: false, error: dbError(error) };
  }
  await db.from('audit_log').insert({ user_id: null, action: 'public_book', entity: 'appointment', entity_id: a.id, details: { who, firm_known: !!firmEmail } });
  return { ok: true, id: a.id, caseNo: a.case_no, pending: a.status === 'pending', key };
}

async function byKey(id: string, key: string) {
  if (!UUID.test(id) || !/^[0-9a-f]{48}$/.test(key)) return null;
  const db = createAdminClient();
  const { data: a } = await db.from('appointments').select('id, firm_id, status, upload_key_hash, upload_key_expires').eq('id', id).maybeSingle();
  if (!a || a.upload_key_hash !== sha(key) || !a.upload_key_expires || new Date(a.upload_key_expires).getTime() < Date.now()) return null;
  return { db, a };
}

/** Signed addresses to upload the documents straight to storage (no file passes through this server). */
export async function publicUploadUrls(id: string, key: string, files: { name: string; size: number; type: string }[]): Promise<R<{ urls: { path: string; url: string }[] }>> {
  const c = await byKey(id, key);
  if (!c) return { ok: false, error: 'פג תוקף הטופס. אפשר לשלוח את המסמכים למרפאה במייל.' };
  const { count } = await c.db.from('documents').select('id', { count: 'exact', head: true }).eq('appointment_id', id);
  if ((count ?? 0) + files.length > 20) return { ok: false, error: 'אפשר לצרף עד 20 מסמכים.' };
  const urls: { path: string; url: string }[] = [];
  for (const f of files.slice(0, 20)) {
    if (!ACCEPTED_TYPES.includes(f.type) || !(f.size > 0) || f.size > MAX_FILE_BYTES) return { ok: false, error: `${clean(f.name, 80)}: אפשר לצרף PDF או תמונה עד 25MB.` };
    const path = `${c.a.firm_id}/${id}/${crypto.randomUUID()}.${EXT[f.type] || 'bin'}`;
    const { data, error } = await c.db.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) return { ok: false, error: 'ההעלאה לא זמינה כרגע.' };
    urls.push({ path, url: data.signedUrl });
  }
  return { ok: true, urls };
}

/** Records the uploaded documents in the case (only files that really arrived, in this case's folder). */
export async function publicConfirmUploads(id: string, key: string, done: { path: string; name: string; size: number; type: string }[]): Promise<R<{ count: number }>> {
  const c = await byKey(id, key);
  if (!c) return { ok: false, error: 'פג תוקף הטופס.' };
  const folder = `${c.a.firm_id}/${id}`;
  const { data: listed } = await c.db.storage.from(BUCKET).list(folder, { limit: 100 });
  const sizes = new Map((listed ?? []).map((o) => [`${folder}/${o.name}`, Number((o.metadata as { size?: number } | null)?.size ?? 0)]));
  const rows = done
    .filter((d) => d.path.startsWith(folder + '/') && sizes.has(d.path) && ACCEPTED_TYPES.includes(d.type))
    .slice(0, 20)
    .map((d) => ({ appointment_id: id, firm_id: c.a.firm_id, storage_path: d.path, file_name: clean(d.name, 255) || 'מסמך', mime_type: d.type, size_bytes: sizes.get(d.path) || Math.max(1, Math.round(+d.size || 1)) }));
  if (rows.length) {
    const { error } = await c.db.from('documents').insert(rows);
    if (error) return { ok: false, error: 'שמירת המסמכים נכשלה.' };
  }
  return { ok: true, count: rows.length };
}

/** After the booking (and the documents): tell the doctor, send the summons, and prepare the brief. */
export async function publicFinish(id: string, key: string): Promise<R> {
  const c = await byKey(id, key);
  if (!c) return { ok: false, error: 'פג תוקף הטופס.' };
  const { data: s } = await c.db.from('settings').select('auto_intake').eq('id', 1).single();
  const { count } = await c.db.from('email_log').select('id', { count: 'exact', head: true }).eq('appointment_id', id).eq('kind', 'new_request');
  if (count) return { ok: true }; // once
  after(async () => {
    await notifyNewRequest(id).catch(() => undefined);
    if (c.a.status === 'booked') await sendSummons(id).catch(() => undefined);
    if (s?.auto_intake !== false) await runIntake(id).catch(() => undefined);
  });
  return { ok: true };
}

/** The first draft of the letter, in its own request (it takes a few minutes). */
export async function publicDraft(id: string, key: string): Promise<R> {
  const c = await byKey(id, key);
  if (!c) return { ok: false, error: '' };
  const { count } = await c.db.from('audit_log').select('id', { count: 'exact', head: true }).eq('entity_id', id).eq('action', 'ai_autodraft');
  if (count) return { ok: true };
  await c.db.from('audit_log').insert({ user_id: null, action: 'ai_autodraft', entity: 'appointment', entity_id: id });
  after(async () => { await autoDraft(id).catch(() => undefined); });
  return { ok: true };
}
