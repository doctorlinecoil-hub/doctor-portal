import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from './supabase/admin';
import { loadDocBlocks } from './caseDocs';
import { TYPES, type ReferralType } from './constants';
import { age, fmtDate, ilParts, todayIL } from './dates';
import type { IntakeData } from './intakeTypes';

export type { IntakeData } from './intakeTypes';

/*
 * AI intake: when a referral arrives (or new documents are added), Claude reads every document and the request,
 * and prepares a structured brief for the doctor: summary, timeline, findings, red flags, what is missing.
 * Runs on the server with the service key, never in front of the referrer, and only the clinic staff can read it.
 */

const DEFAULT_MODEL = 'claude-opus-5-5';

const NEEDS: Record<ReferralType, string> = {
  referral: 'להפניה לבדיקות: תלונות עדכניות, בדיקות קודמות באותו אזור (כדי לא לחזור עליהן), אבחנות ידועות, תרופות נוגדות קרישה או שתלים מתכתיים (רלוונטי ל־MRI).',
  summary: 'לסיכום ביקור: מכתבי שחרור, סיכומי רופאים קודמים, בדיקות הדמיה ומעבדה, טיפול תרופתי עדכני.',
  nii: 'לחוות דעת לביטוח לאומי: תיעוד רפואי מיום האירוע (מיון / קופת חולים), טופס ב.ל. 250 או הודעה על פגיעה בעבודה אם רלוונטי, החלטות ופרוטוקולים של ועדות קודמות, בדיקות הדמיה עם תאריכים, תיעוד טיפולים (פיזיותרפיה, ניתוחים), מידע על כושר העבודה וההשפעה התפקודית.',
  legal: 'לחוות דעת משפטית: כתב תביעה או פירוט השאלות שבית המשפט / ב"כ מבקשים לענות עליהן, תיעוד רפואי מיום האירוע, תיק רפואי קודם לאירוע (לבחינת מצב קודם וקשר סיבתי), בדיקות הדמיה, תיעוד טיפולים, החלטות ועדות רפואיות קודמות (ב.ל., משרד הביטחון), מידע תעסוקתי.',
};

const str = { type: 'string' } as const;
const strArr = { type: 'array', items: str } as const;
const obj = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: 'object' as const, properties, required, additionalProperties: false });

const TOOL: Anthropic.Tool = {
  name: 'case_brief',
  description: 'שמירת הסיכום המובנה של התיק עבור הרופא.',
  input_schema: obj({
    summary: { ...str, description: 'סיכום קליני של 3–6 משפטים: מי המטופל, מה קרה, המצב היום, ומה המפנה מבקש.' },
    request: obj({
      goal: { ...str, description: 'מה בדיוק המפנה מבקש מהרופא, במשפט אחד.' },
      recipient: { ...str, description: 'למי המסמך מיועד (ב.ל., בית משפט, ב"כ, מכון דימות...). ריק אם לא ידוע.' },
      event: { ...str, description: 'תיאור קצר של האירוע או המחלה. ריק אם אין.' },
      event_date: { ...str, description: 'תאריך האירוע בפורמט YYYY-MM-DD או חלקי (YYYY-MM). ריק אם לא ידוע.' },
      questions: { ...strArr, description: 'השאלות שהמסמך חייב לענות עליהן.' },
    }),
    patient_check: {
      type: 'array',
      description: 'אי־התאמות בין פרטי המטופל בטופס לבין המסמכים (שם, ת.ז., תאריך לידה). ריק אם הכול תואם.',
      items: obj({ item: str, detail: str }),
    },
    diagnoses: { type: 'array', items: obj({ name: str, date: str, source: str }) },
    timeline: {
      type: 'array',
      description: 'ציר זמן רפואי כרונולוגי (מהמוקדם למאוחר). כל פריט עם מקור (שם המסמך).',
      items: obj({ date: { ...str, description: 'YYYY-MM-DD, YYYY-MM או YYYY' }, title: str, detail: str, source: str }),
    },
    imaging: {
      type: 'array',
      description: 'בדיקות הדמיה, EMG, מעבדה ובדיקות עזר אחרות.',
      items: obj({ date: str, test: str, finding: str, source: str }),
    },
    medications: strArr,
    treatments: { ...strArr, description: 'ניתוחים, פיזיותרפיה, הזרקות, אשפוזים.' },
    function_work: { ...str, description: 'מצב תפקודי ותעסוקתי, ימי מחלה, הגבלות. ריק אם אין מידע.' },
    red_flags: {
      type: 'array',
      description: 'דברים שהרופא חייב לשים לב אליהם: ממצאים חמורים, סתירות בין מסמכים, מצב קודם לאירוע, פערי זמנים, מסמכים לא קריאים.',
      items: obj({ text: str, level: { type: 'string', enum: ['high', 'medium'] } }),
    },
    missing: {
      type: 'array',
      description: 'מסמכים או מידע שחסרים כדי להשלים את המסמך המבוקש, מנוסחים כבקשה שאפשר לשלוח למפנה.',
      items: obj({ item: str, why: str }),
    },
    documents: {
      type: 'array',
      description: 'כל מסמך שצורף: סוג, תאריך ותמצית בשורה.',
      items: obj({ file: str, kind: str, date: str, gist: str }),
    },
    exam_focus: { ...strArr, description: 'מה כדאי לבדוק או לשאול בביקור, לפי המסמכים והבקשה.' },
    suggested_type: { type: 'string', enum: ['referral', 'summary', 'nii', 'legal', ''], description: 'סוג המסמך שמתאים לבקשה בפועל.' },
    type_note: { ...str, description: 'אם סוג המסמך שנבחר בטופס לא מתאים לבקשה, הסבר קצר. אחרת ריק.' },
    readiness: { type: 'integer', minimum: 0, maximum: 100, description: 'כמה התיק שלם להכנת המסמך המבוקש, באחוזים.' },
  }),
};

export async function runIntake(appointmentId: string, opts: { force?: boolean } = {}) {
  const db = createAdminClient();
  const { data: existing } = await db.from('case_intake').select('status, started_at').eq('appointment_id', appointmentId).maybeSingle();
  if (!opts.force && existing?.status === 'running' && existing.started_at && Date.now() - new Date(existing.started_at).getTime() < 8 * 60_000) return;

  const now = new Date().toISOString();
  const mark = (patch: Record<string, unknown>) =>
    db.from('case_intake').upsert({ appointment_id: appointmentId, updated_at: new Date().toISOString(), ...patch }, { onConflict: 'appointment_id' });

  if (!process.env.ANTHROPIC_API_KEY) {
    await mark({ status: 'error', error: 'חסר מפתח ה־AI (ANTHROPIC_API_KEY) בהגדרות השרת.', finished_at: now });
    return;
  }
  await mark({ status: 'running', error: '', started_at: now, finished_at: null });

  try {
    const [{ data: a }, { data: notes }, { data: docs }] = await Promise.all([
      db.from('appointments').select('*, firms(name, kind)').eq('id', appointmentId).maybeSingle(),
      db.from('case_notes').select('body, kind, created_at').eq('appointment_id', appointmentId).order('created_at').limit(100),
      db.from('documents').select('file_name, storage_path').eq('appointment_id', appointmentId).order('created_at').limit(60),
    ]);
    if (!a) throw new Error('התיק לא נמצא');
    const type = a.referral_type as ReferralType;
    const { content, attached, skipped } = await loadDocBlocks(db, docs ?? []);
    const firm = a.firms as { name?: string } | null;
    const ag = age(a.patient_dob);
    content.push({
      type: 'text',
      text: [
        'אתה עוזר רפואי־משפטי בכיר במרפאה של רופא מומחה בישראל. הגיעה פנייה חדשה. קרא בעיון את כל המסמכים המצורפים (כולל סריקות וכתב יד) ואת הבקשה, והכן לרופא תדריך מובנה לפני הביקור.',
        `סוג המסמך שהמפנה ביקש: ${TYPES[type].label}.`,
        `המפנה: ${firm?.name || 'לא ידוע'}.`,
        `פרטי המטופל בטופס: ${a.patient_name}, ת.ז. ${a.patient_id_number}${a.patient_dob ? `, תאריך לידה ${fmtDate(a.patient_dob)} (גיל ${ag})` : ''}.`,
        `מועד הביקור: ${fmtDate(ilParts(a.starts_at).date)}. היום: ${fmtDate(todayIL())}.`,
        `בקשת המפנה והערותיו:\n"""\n${[a.notes, ...(notes ?? []).map((n) => (n.kind === 'request' ? `(בקשת המרפאה) ${n.body}` : `(הערה נוספת) ${n.body}`))].filter(Boolean).join('\n').slice(0, 30000) || '(אין הערות)'}\n"""`,
        attached.length ? `צורפו ${attached.length} מסמכים: ${attached.join(', ')}.` : 'לא צורפו מסמכים.',
        skipped.length ? `מסמכים שלא נקראו (גדולים מדי או פגומים): ${skipped.join(', ')}. ציין זאת ב־red_flags.` : '',
        `מה בדרך כלל נדרש: ${NEEDS[type]}`,
        `כללים:
1. רק עובדות מהמסמכים ומהבקשה. אל תמציא ממצאים, תאריכים או אבחנות. אם משהו לא ברור, כתוב שהוא לא ברור.
2. בכל ממצא ציין מקור: שם המסמך כפי שמופיע למעלה.
3. תאריכים בפורמט YYYY-MM-DD (או YYYY-MM / YYYY כשהיום לא ידוע).
4. עברית רפואית ברורה וקצרה. מונחים מקצועיים באנגלית מותרים (MRI, EMG, L4-L5).
5. ב"missing" רשום רק מה שבאמת חסר כדי להשלים את המסמך המבוקש, בניסוח שאפשר לשלוח כבקשה למפנה.
6. החזר את התשובה רק דרך הכלי case_brief.`,
      ].filter(Boolean).join('\n\n'),
    });

    const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
    const client = new Anthropic();
    const msg = await client.messages
      .stream({ model, max_tokens: 16000, tools: [TOOL], tool_choice: { type: 'tool', name: TOOL.name }, messages: [{ role: 'user', content }] })
      .finalMessage();
    const block = msg.content.find((b) => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') throw new Error('לא התקבלה תשובה מובנית');
    const data = normalize(block.input as Partial<IntakeData>);
    await mark({ status: 'done', data, error: '', model, doc_count: attached.length, finished_at: new Date().toISOString() });
    await db.from('audit_log').insert({ action: 'ai_intake', entity: 'appointment', entity_id: appointmentId, details: { model, docs: attached.length } });
  } catch (e) {
    console.error('intake failed', (e as Error).message);
    await mark({ status: 'error', error: ((e as Error).message || 'תקלה').slice(0, 900), finished_at: new Date().toISOString() });
  }
}

/** Scan again only when documents were added after the last scan, and no scan is under way. */
export async function rescanIfNeeded(appointmentId: string) {
  const db = createAdminClient();
  const [{ data: i }, { data: last }] = await Promise.all([
    db.from('case_intake').select('status, finished_at, started_at').eq('appointment_id', appointmentId).maybeSingle(),
    db.from('documents').select('created_at').eq('appointment_id', appointmentId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (i && (i.status === 'queued' || i.status === 'running') && i.started_at && Date.now() - new Date(i.started_at).getTime() < 8 * 60_000) return;
  if (i?.finished_at && (!last || new Date(last.created_at) <= new Date(i.finished_at))) return;
  await runIntake(appointmentId);
}

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const s = (v: unknown) => (typeof v === 'string' ? v : '');

function normalize(i: Partial<IntakeData>): IntakeData {
  const r = (i.request ?? {}) as Partial<IntakeData['request']>;
  return {
    summary: s(i.summary),
    request: { goal: s(r.goal), recipient: s(r.recipient), event: s(r.event), event_date: s(r.event_date), questions: arr<string>(r.questions).map(s).filter(Boolean) },
    patient_check: arr(i.patient_check),
    diagnoses: arr(i.diagnoses),
    timeline: arr<IntakeData['timeline'][number]>(i.timeline).sort((a, b) => s(a.date).localeCompare(s(b.date))),
    imaging: arr(i.imaging),
    medications: arr<string>(i.medications).map(s).filter(Boolean),
    treatments: arr<string>(i.treatments).map(s).filter(Boolean),
    function_work: s(i.function_work),
    red_flags: arr(i.red_flags),
    missing: arr(i.missing),
    documents: arr(i.documents),
    exam_focus: arr<string>(i.exam_focus).map(s).filter(Boolean),
    suggested_type: (['referral', 'summary', 'nii', 'legal'].includes(s(i.suggested_type)) ? i.suggested_type : '') as IntakeData['suggested_type'],
    type_note: s(i.type_note),
    readiness: Math.max(0, Math.min(100, Math.round(Number(i.readiness) || 0))),
  };
}

/** A short text version of the brief, to help the letter draft. */
export function intakeForPrompt(d: IntakeData | null | undefined) {
  if (!d) return '';
  return [
    d.summary,
    d.request.questions.length ? `שאלות שהמסמך צריך לענות עליהן: ${d.request.questions.join('; ')}` : '',
    d.timeline.length ? `ציר זמן:\n${d.timeline.map((t) => `- ${t.date} ${t.title}: ${t.detail} (${t.source})`).join('\n')}` : '',
    d.red_flags.length ? `לתשומת לב: ${d.red_flags.map((r) => r.text).join('; ')}` : '',
  ].filter(Boolean).join('\n').slice(0, 12000);
}
