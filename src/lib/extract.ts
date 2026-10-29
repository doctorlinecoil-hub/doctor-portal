import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from './supabase/admin';
import { loadDocBlocks } from './caseDocs';
import { aiErrorText } from './aiErrors';
import { TYPES } from './constants';

/*
 * Reads the uploaded documents of a new case and pulls out the patient's details and what the referrer needs,
 * so the referrer only checks and confirms instead of typing. Runs with the service key: callers must check access.
 */

const DEFAULT_MODEL = 'claude-opus-5-5';

export type Extracted = {
  name: string; id_number: string; dob: string; phone: string; email: string;
  suggested_type: '' | keyof typeof TYPES; request: string; event: string; event_date: string;
  /** which fields were read with certainty */
  sure: string[];
  /** a short note to the referrer: documents of different people, unreadable pages, and so on */
  warning: string;
  /** who refers, when the documents show it (a law office's letterhead, a broker's form) */
  referrer_kind?: '' | 'law' | 'broker' | 'private';
  referrer_office?: string; referrer_contact?: string; referrer_email?: string; referrer_phone?: string;
};

const str = { type: 'string' } as const;
const TOOL: Anthropic.Tool = {
  name: 'patient_details',
  description: 'שמירת פרטי המטופל ופרטי הבקשה כפי שנמצאו במסמכים.',
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['name', 'id_number', 'dob', 'phone', 'email', 'suggested_type', 'request', 'event', 'event_date', 'sure', 'warning', 'referrer_kind', 'referrer_office', 'referrer_contact', 'referrer_email', 'referrer_phone'],
    properties: {
      name: { ...str, description: 'שם מלא של המטופל בעברית (שם פרטי ושם משפחה). ריק אם לא נמצא.' },
      id_number: { ...str, description: 'מספר תעודת זהות של המטופל, ספרות בלבד. ריק אם לא נמצא.' },
      dob: { ...str, description: 'תאריך לידה בפורמט YYYY-MM-DD. ריק אם לא נמצא.' },
      phone: { ...str, description: 'טלפון נייד של המטופל. ריק אם לא נמצא. לא טלפון של בית חולים או משרד.' },
      email: { ...str, description: 'כתובת מייל של המטופל עצמו. ריק אם לא נמצאה.' },
      suggested_type: { type: 'string', enum: ['referral', 'summary', 'nii', 'legal', ''], description: 'מה המפנה צריך מהרופא: referral = הפניה לבדיקות, summary = סיכום ביקור, nii = חוות דעת לביטוח לאומי, legal = חוות דעת לבית משפט. ריק אם לא ברור.' },
      request: { ...str, description: 'במשפט או שניים: מה המפנה מבקש מהרופא ולמה. נכתב כהערה לרופא.' },
      event: { ...str, description: 'האירוע או המחלה בקצרה (תאונת עבודה, תאונת דרכים, מחלה...). ריק אם אין.' },
      event_date: { ...str, description: 'תאריך האירוע YYYY-MM-DD או YYYY-MM. ריק אם לא ידוע.' },
      sure: { type: 'array', items: { type: 'string', enum: ['name', 'id_number', 'dob', 'phone', 'email', 'suggested_type'] }, description: 'השדות שנמצאו בבירור במסמכים.' },
      warning: { ...str, description: 'הערה קצרה למפנה אם יש בעיה: מסמכים של אנשים שונים, פרטים סותרים, מסמך לא קריא. אחרת ריק.' },
      referrer_kind: { type: 'string', enum: ['law', 'broker', 'private', ''], description: 'מי פונה לרופא: law = משרד עורכי דין, broker = מתווך / חברת מיצוי זכויות / סוכן ביטוח, private = המטופל בעצמו. ריק אם לא ברור.' },
      referrer_office: { ...str, description: 'שם משרד עורכי הדין או החברה המפנה, כפי שמופיע בנייר המכתבים או בחתימה. ריק אם לא נמצא.' },
      referrer_contact: { ...str, description: 'שם עורך הדין או איש הקשר שחתום על הפנייה. ריק אם לא נמצא.' },
      referrer_email: { ...str, description: 'מייל של המשרד המפנה או של איש הקשר (לא של המטופל, לא של בית חולים או בית משפט). ריק אם לא נמצא.' },
      referrer_phone: { ...str, description: 'טלפון של המשרד המפנה. ריק אם לא נמצא.' },
    },
  },
};

const digits = (s: string) => String(s || '').replace(/\D/g, '');
const isoDate = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : '');

/** Keeps only known fields, checked and bounded (also used on what a browser sends back). */
export function cleanExtract(x: Partial<Extracted>): Extracted {
  const id = digits(x.id_number || '');
  const phone = String(x.phone || '').replace(/[^\d+\-\s]/g, '').trim();
  const email = String(x.email || '').trim().toLowerCase();
  return {
    name: String(x.name || '').trim().slice(0, 120),
    id_number: id.length >= 5 && id.length <= 10 ? id : '',
    dob: isoDate(String(x.dob || '')),
    phone: digits(phone).length >= 9 ? phone.slice(0, 30) : '',
    email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email.slice(0, 200) : '',
    suggested_type: (x.suggested_type && x.suggested_type in TYPES ? x.suggested_type : '') as Extracted['suggested_type'],
    request: String(x.request || '').trim().slice(0, 1500),
    event: String(x.event || '').trim().slice(0, 300),
    event_date: String(x.event_date || '').trim().slice(0, 10),
    sure: Array.isArray(x.sure) ? x.sure.filter((k) => typeof k === 'string').slice(0, 10) : [],
    warning: String(x.warning || '').trim().slice(0, 500),
    referrer_kind: (['law', 'broker', 'private'].includes(String(x.referrer_kind)) ? x.referrer_kind : '') as Extracted['referrer_kind'],
    referrer_office: String(x.referrer_office || '').trim().slice(0, 160),
    referrer_contact: String(x.referrer_contact || '').trim().slice(0, 120),
    referrer_email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(x.referrer_email || '').trim()) ? String(x.referrer_email).trim().toLowerCase().slice(0, 200) : '',
    referrer_phone: digits(String(x.referrer_phone || '')).length >= 9 ? String(x.referrer_phone).replace(/[^\d+\-\s]/g, '').trim().slice(0, 30) : '',
  };
}

const PROMPT = [
  'אלה מסמכים רפואיים ומשפטיים שמפנה (משרד עורכי דין, מתווך או המטופל עצמו) העלה לתיק חדש אצל רופא מומחה בישראל.',
  'מצא בהם את פרטי המטופל (שם, ת.ז., תאריך לידה, טלפון, מייל), מה המפנה צריך מהרופא, ומי המפנה (שם המשרד, איש הקשר, מייל וטלפון של המשרד).',
  'העתק פרטים בדיוק כפי שהם כתובים. אל תמציא ואל תנחש: מה שלא כתוב בבירור נשאר ריק.',
  'אם מופיעים כמה אנשים, המטופל הוא מי שהמסמכים הרפואיים עוסקים בו (לא עורך הדין ולא הרופא).',
].join('\n');

/** Reads the given stored files and returns the details found in them. Runs with the service key: callers check access. */
export async function extractFromFiles(docs: { file_name: string; storage_path: string }[]): Promise<{ ok: true; data: Extracted } | { ok: false; error: string; manual?: boolean }> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, manual: true, error: 'הסריקה האוטומטית עוד לא הופעלה במרפאה. מלאו את הפרטים ידנית.' };
  if (!docs.length) return { ok: false, manual: true, error: 'עוד לא הועלו מסמכים.' };
  const db = createAdminClient();
  try {
    const { content, attached } = await loadDocBlocks(db, docs);
    if (!attached.length) return { ok: false, error: 'לא הצלחנו לקרוא את המסמכים. אפשר להעלות PDF או תמונה ברורה.' };
    content.push({ type: 'text', text: PROMPT });
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      max_tokens: 2000,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{ role: 'user', content }],
    });
    const block = msg.content.find((b) => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') return { ok: false, error: 'לא התקבלה תשובה מהסריקה.' };
    return { ok: true, data: cleanExtract(block.input as Partial<Extracted>) };
  } catch (e) {
    return { ok: false, error: e instanceof Error && !('status' in e) ? e.message : aiErrorText(e) };
  }
}

export async function extractDetails(appointmentId: string): Promise<{ ok: true; data: Extracted } | { ok: false; error: string }> {
  const db = createAdminClient();
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: 'הסריקה האוטומטית עוד לא הופעלה במרפאה. מלאו את הפרטים ידנית.' };
  const { data: docs } = await db.from('documents').select('file_name, storage_path').eq('appointment_id', appointmentId).order('created_at').limit(40);
  if (!docs?.length) return { ok: false, error: 'עוד לא הועלו מסמכים.' };
  await db.from('appointments').update({ extract_status: 'running', extract_error: '' }).eq('id', appointmentId);
  const r = await extractFromFiles(docs);
  if (r.ok) await db.from('appointments').update({ extract: r.data, extract_status: 'done', extract_error: '' }).eq('id', appointmentId);
  else await db.from('appointments').update({ extract_status: 'error', extract_error: r.error.slice(0, 500) }).eq('id', appointmentId);
  return r.ok ? r : { ok: false, error: r.error };
}
