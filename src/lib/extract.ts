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
};

const str = { type: 'string' } as const;
const TOOL: Anthropic.Tool = {
  name: 'patient_details',
  description: 'שמירת פרטי המטופל ופרטי הבקשה כפי שנמצאו במסמכים.',
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['name', 'id_number', 'dob', 'phone', 'email', 'suggested_type', 'request', 'event', 'event_date', 'sure', 'warning'],
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
    },
  },
};

const digits = (s: string) => String(s || '').replace(/\D/g, '');
const isoDate = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : '');

function clean(x: Partial<Extracted>): Extracted {
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
  };
}

export async function extractDetails(appointmentId: string): Promise<{ ok: true; data: Extracted } | { ok: false; error: string }> {
  const db = createAdminClient();
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: 'הסריקה האוטומטית עוד לא הופעלה במרפאה. מלאו את הפרטים ידנית.' };
  const { data: docs } = await db.from('documents').select('file_name, storage_path').eq('appointment_id', appointmentId).order('created_at').limit(40);
  if (!docs?.length) return { ok: false, error: 'עוד לא הועלו מסמכים.' };
  await db.from('appointments').update({ extract_status: 'running', extract_error: '' }).eq('id', appointmentId);
  try {
    const { content, attached } = await loadDocBlocks(db, docs);
    if (!attached.length) throw new Error('לא הצלחנו לקרוא את המסמכים. אפשר להעלות PDF או תמונה ברורה.');
    content.push({
      type: 'text',
      text: [
        'אלה מסמכים רפואיים ומשפטיים שמפנה (משרד עורכי דין, מתווך או המטופל עצמו) העלה לתיק חדש אצל רופא מומחה בישראל.',
        'מצא בהם את פרטי המטופל (שם, ת.ז., תאריך לידה, טלפון, מייל) ומה המפנה צריך מהרופא.',
        'העתק פרטים בדיוק כפי שהם כתובים. אל תמציא ואל תנחש: מה שלא כתוב בבירור נשאר ריק.',
        'אם מופיעים כמה אנשים, המטופל הוא מי שהמסמכים הרפואיים עוסקים בו (לא עורך הדין ולא הרופא).',
      ].join('\n'),
    });
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      max_tokens: 2000,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{ role: 'user', content }],
    });
    const block = msg.content.find((b) => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') throw new Error('לא התקבלה תשובה מהסריקה.');
    const data = clean(block.input as Partial<Extracted>);
    await db.from('appointments').update({ extract: data, extract_status: 'done', extract_error: '' }).eq('id', appointmentId);
    return { ok: true, data };
  } catch (e) {
    const error = e instanceof Error && !('status' in e) ? e.message : aiErrorText(e);
    await db.from('appointments').update({ extract_status: 'error', extract_error: error.slice(0, 500) }).eq('id', appointmentId);
    return { ok: false, error };
  }
}
