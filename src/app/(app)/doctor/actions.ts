'use server';
import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { dbError } from '@/lib/constants';
import { runIntake } from '@/lib/intake';
import { deliverLetter, sendDeclined, sendDocRequest, sendLetterTo, sendRx, sendSummons } from '@/lib/notify';

type Result = { ok: boolean; error?: string; info?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Staff only, and only for a case the caller can see. */
async function staffCase(id: string) {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data: staff } = await supabase.rpc('is_staff');
  if (!staff) return null;
  const { data } = await supabase.from('appointments').select('id, status').eq('id', id).maybeSingle();
  return data ? { supabase, appt: data as { id: string; status: string } } : null;
}

const done = (id: string) => {
  revalidatePath(`/doctor/cases/${id}`);
  revalidatePath('/doctor');
};

export async function approveRequest(id: string): Promise<Result> {
  const c = await staffCase(id);
  if (!c) return { ok: false, error: 'אין הרשאה.' };
  const { error } = await c.supabase.rpc('approve_appointment', { p_id: id });
  if (error) return { ok: false, error: dbError(error) };
  const r = await sendSummons(id);
  done(id);
  return { ok: true, info: r.sent ? 'התור אושר והזימון נשלח במייל' : `התור אושר.${r.info ? ` הזימון לא נשלח במייל: ${r.info}` : ''} אפשר לשלוח בוואטסאפ.` };
}

/** The deposit arrived: record it as a payment, approve, and send the summons. */
export async function approveWithDeposit(id: string, method: 'transfer' | 'bit' | 'cash' | 'card', amount: number): Promise<Result> {
  const c = await staffCase(id);
  if (!c) return { ok: false, error: 'אין הרשאה.' };
  const m = ['transfer', 'bit', 'cash', 'card'].includes(method) ? method : 'transfer';
  const { error: e1 } = await c.supabase.rpc('record_deposit', { p_id: id, p_method: m, p_amount: Math.max(0, Number(amount) || 0) });
  if (e1) return { ok: false, error: dbError(e1) };
  const { error } = await c.supabase.rpc('approve_appointment', { p_id: id });
  if (error) return { ok: false, error: dbError(error) };
  const r = await sendSummons(id);
  done(id);
  return { ok: true, info: r.sent ? 'המקדמה נרשמה, התור אושר והזימון נשלח' : `המקדמה נרשמה והתור אושר.${r.info ? ` הזימון לא נשלח במייל: ${r.info}` : ''}` };
}

export async function declineRequest(id: string, reason: string): Promise<Result> {
  const c = await staffCase(id);
  if (!c) return { ok: false, error: 'אין הרשאה.' };
  const { error } = await c.supabase.rpc('decline_appointment', { p_id: id, p_reason: String(reason || '').slice(0, 500) });
  if (error) return { ok: false, error: dbError(error) };
  after(() => sendDeclined(id).then(() => undefined));
  done(id);
  return { ok: true, info: 'הבקשה נדחתה והמפנה עודכן' };
}

export async function resendSummons(id: string): Promise<Result> {
  const c = await staffCase(id);
  if (!c) return { ok: false, error: 'אין הרשאה.' };
  const r = await sendSummons(id, { force: true });
  done(id);
  return r.ok ? { ok: true, info: 'הזימון נשלח שוב' } : { ok: false, error: r.info || 'השליחה נכשלה' };
}

export async function rescanCase(id: string): Promise<Result> {
  const c = await staffCase(id);
  if (!c) return { ok: false, error: 'אין הרשאה.' };
  const { createAdminClient } = await import('@/lib/supabase/admin');
  await createAdminClient().from('case_intake').upsert({ appointment_id: id, status: 'queued', error: '', updated_at: new Date().toISOString() }, { onConflict: 'appointment_id' });
  after(() => runIntake(id, { force: true }));
  done(id);
  return { ok: true, info: 'הסריקה התחילה' };
}

export async function requestDocuments(id: string, items: string[], note: string): Promise<Result> {
  const c = await staffCase(id);
  if (!c) return { ok: false, error: 'אין הרשאה.' };
  const list = (items || []).map((s) => String(s).trim().slice(0, 300)).filter(Boolean).slice(0, 20);
  const text = String(note || '').trim().slice(0, 3000);
  if (!list.length && !text) return { ok: false, error: 'בחרו מה לבקש או כתבו הערה.' };
  const body = [list.map((i) => `- ${i}`).join('\n'), text].filter(Boolean).join('\n\n');
  const { error } = await c.supabase.from('case_notes').insert({ appointment_id: id, body, kind: 'request' });
  if (error) return { ok: false, error: dbError(error) };
  const r = await sendDocRequest(id, list, text);
  done(id);
  return { ok: true, info: r.ok ? 'הבקשה נשלחה למפנה במייל והופיעה אצלו בתיק' : 'הבקשה הופיעה אצל המפנה בתיק (המייל לא נשלח)' };
}

export async function resolveRequest(noteId: string, caseId: string): Promise<Result> {
  const c = await staffCase(caseId);
  if (!c || !UUID.test(noteId)) return { ok: false, error: 'אין הרשאה.' };
  const { error } = await c.supabase.from('case_notes').update({ resolved_at: new Date().toISOString() }).eq('id', noteId).eq('appointment_id', caseId);
  if (error) return { ok: false, error: dbError(error) };
  done(caseId);
  return { ok: true };
}

/** After the doctor marks the letter final: email it (or the "awaiting payment" notice). */
export async function sendLetter(id: string, force = false): Promise<Result> {
  const c = await staffCase(id);
  if (!c) return { ok: false, error: 'אין הרשאה.' };
  const r = await deliverLetter(id, { force });
  done(id);
  return r.ok ? { ok: true, info: r.info } : { ok: false, error: r.info };
}

/** The final letter to addresses the doctor types by hand (instead of, or in addition to, the referrer). */
export async function sendLetterExtra(id: string, emails: string): Promise<Result> {
  const c = await staffCase(id);
  if (!c) return { ok: false, error: 'אין הרשאה.' };
  const r = await sendLetterTo(id, String(emails || '').split(/[,;\s]+/), { byReferrer: false });
  done(id);
  return r.ok ? { ok: true, info: r.info } : { ok: false, error: r.info };
}

/** Approve (the appointment moves and an updated summons goes out) or decline a referrer's reschedule request. */
export async function decideReschedule(requestId: string, caseId: string, approve: boolean, response = ''): Promise<Result> {
  const c = await staffCase(caseId);
  if (!c || !UUID.test(requestId)) return { ok: false, error: 'אין הרשאה.' };
  const { error } = await c.supabase.rpc('decide_reschedule', { p_id: requestId, p_approve: approve, p_response: String(response || '').slice(0, 500) });
  if (error) return { ok: false, error: dbError(error) };
  let info = approve ? 'המועד עודכן' : 'הבקשה נדחתה והמפנה עודכן';
  if (approve) {
    const r = await sendSummons(caseId, { force: true });
    info = r.sent ? 'המועד עודכן ונשלח זימון מעודכן במייל' : 'המועד עודכן. אפשר לשלוח זימון מעודכן בוואטסאפ.';
  }
  done(caseId);
  return { ok: true, info };
}

/** A prescription by email (to the patient, or to an address the doctor types). */
export async function sendPrescription(rxId: string, caseId: string, emails: string): Promise<Result> {
  const c = await staffCase(caseId);
  if (!c || !UUID.test(rxId)) return { ok: false, error: 'אין הרשאה.' };
  const { data: rx } = await c.supabase.from('prescriptions').select('id').eq('id', rxId).eq('appointment_id', caseId).maybeSingle();
  if (!rx) return { ok: false, error: 'המרשם לא נמצא.' };
  const r = await sendRx(rxId, String(emails || '').split(/[,;\s]+/));
  done(caseId);
  return r.ok ? { ok: true, info: r.info } : { ok: false, error: r.info };
}

/** Approve (or take back) the payment of a case: the document is released to the referrer, and goes out by email if it waited. */
export async function setPaymentOk(id: string, ok: boolean): Promise<Result> {
  const c = await staffCase(id);
  if (!c) return { ok: false, error: 'אין הרשאה.' };
  const { error } = await c.supabase.rpc('set_payment_ok', { p_id: id, p_ok: ok });
  if (error) return { ok: false, error: dbError(error) };
  if (ok) after(() => deliverLetter(id, { onlyIfAwaitingPayment: true }).then(() => undefined).catch(() => undefined));
  done(id);
  revalidatePath('/firm');
  return { ok: true, info: ok ? 'התשלום אושר. המסמך זמין עכשיו למפנה, ואם חיכה, נשלח אליו במייל.' : 'אישור התשלום בוטל. המסמך שוב ממתין לתשלום.' };
}
