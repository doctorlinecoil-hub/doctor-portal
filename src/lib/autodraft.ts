import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from './supabase/admin';
import { loadDocBlocks } from './caseDocs';
import { SETTINGS_DEFAULTS, type ReferralType, type Settings } from './constants';
import { intakeForPrompt, type IntakeData } from './intake';
import { buildPrompt, parseDraft } from './letter';
import { richBody, textToHtml } from './richtext';

/*
 * Once a referrer completes a case, the AI writes a first draft of the letter from the documents and the request.
 * The doctor finds it ready in the letter editor, edits it and sends it. It never overwrites the doctor's own work.
 */

const DEFAULT_MODEL = 'claude-opus-5-5';

export async function autoDraft(appointmentId: string): Promise<{ ok: boolean; info: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, info: 'אין מפתח AI' };
  const db = createAdminClient();
  const [{ data: a }, { data: existing }, { data: notes }, { data: docs }, { data: settings }, { data: intake }] = await Promise.all([
    db.from('appointments').select('*, firms(name)').eq('id', appointmentId).maybeSingle(),
    db.from('letters').select('body, is_final').eq('appointment_id', appointmentId).maybeSingle(),
    db.from('case_notes').select('body').eq('appointment_id', appointmentId).order('created_at').limit(100),
    db.from('documents').select('file_name, storage_path').eq('appointment_id', appointmentId).order('created_at').limit(60),
    db.from('settings').select('*').eq('id', 1).single(),
    db.from('case_intake').select('status, data').eq('appointment_id', appointmentId).maybeSingle(),
  ]);
  if (!a || !a.referral_type || a.status === 'cancelled') return { ok: false, info: 'אין תיק פעיל' };
  if (existing?.is_final || String(existing?.body || '').trim()) return { ok: true, info: 'כבר יש טיוטה' };
  const s = { ...SETTINGS_DEFAULTS, ...(settings as Settings) } as Settings;
  if (!s.auto_draft) return { ok: true, info: 'כבוי בהגדרות' };

  const letterType = a.referral_type as ReferralType;
  const { content, attached, skipped } = await loadDocBlocks(db, docs ?? []);
  content.push({
    type: 'text',
    text: buildPrompt({
      letterType,
      serviceId: a.service_id,
      exam: '',
      settings: s,
      visitDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(a.starts_at)),
      patient: { name: a.patient_name, idNumber: a.patient_id_number, dob: a.patient_dob },
      firmName: (a.firms as { name?: string } | null)?.name ?? '',
      notes: [a.notes, ...(notes ?? []).map((n) => `(הערה נוספת) ${n.body}`)].join('\n').slice(0, 40000).split('\n'),
      attached,
      skipped,
      intake: intake?.status === 'done' ? intakeForPrompt(intake.data as IntakeData) : '',
    }),
  });

  const client = new Anthropic();
  const msg = await client.messages.stream({ model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL, max_tokens: 16000, messages: [{ role: 'user', content }] }).finalMessage();
  const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  const d = parseDraft(text);
  if (!d.body.trim()) return { ok: false, info: 'הטיוטה יצאה ריקה' };

  // the doctor may have started writing in the meantime: only write into an empty letter
  const { data: again } = await db.from('letters').select('body').eq('appointment_id', appointmentId).maybeSingle();
  if (String(again?.body || '').trim()) return { ok: true, info: 'הרופא כבר התחיל לכתוב' };
  const now = new Date().toISOString();
  await db.from('letters').upsert({
    appointment_id: appointmentId, letter_type: letterType, recipient: d.recipient, subject: d.subject,
    body: richBody(textToHtml(d.body)), ai_draft_at: now, updated_at: now, updated_by: null,
  }, { onConflict: 'appointment_id' });
  return { ok: true, info: 'נוצרה טיוטה' };
}
