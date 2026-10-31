// Sample data for the design preview only (PREVIEW=1). Never used in production pages.
import type { Settings } from '@/lib/constants';
import { dayNum, fromDayNum, ilToUtc, todayIL, weekday } from '@/lib/dates';
import type { ApptRow, CaseDetail, DocRow, NoteRow, PaymentRow } from '@/lib/types';
import type { IntakeRow } from '@/lib/intakeTypes';

export const settings: Settings = {
  slot_minutes: 30, horizon_days: 30, notice_hours: 24, max_open_per_firm: 30, change_business_days: 5, allow_reschedule: true, allow_cancel: true, cancel_days: 3, change_days_unit: 'business', max_reschedules: 1, daily_digest: true, auto_pay_reminder_days: 7, policy_in_summons: true, require_staff_mfa: true,
  weekly: {
    0: { on: true, from: '09:00', to: '14:00' }, 1: { on: true, from: '09:00', to: '14:00' }, 2: { on: true, from: '09:00', to: '14:00' },
    3: { on: true, from: '09:00', to: '14:00' }, 4: { on: true, from: '09:00', to: '13:00' }, 5: { on: false, from: '09:00', to: '12:00' }, 6: { on: false, from: '09:00', to: '12:00' },
  } as Settings['weekly'],
  blocked_dates: [],
  prices: { referral: 600, summary: 900, nii: 2500, legal: 10000 },
  letter_requires_payment: true,
  invoice_item: 'ייעוץ רפואי',
  lh_name: 'ד״ר אלרן חנוך',
  lh_titles: 'נוירוכירורג ילדים ומבוגרים\nמומחה לניתוחי מערכת עצבים מרכזית בגישה זעיר פולשנית',
  lh_licenses: 'מ.ר. 18425 · מומחה 12732',
  lh_address: 'מגדל ספיר, מתחם הבורסה, רחוב תובל 40, קומה 23, רמת גן',
  lh_phone: '052-4266440',
  lh_email: 'd.m.elranhanoch@gmail.com',
  lh_education: '',
  require_approval: true, notify_email: '', bring_items: 'תעודת זהות\nכל המסמכים הרפואיים\nרשימת תרופות עדכנית', summons_note: '', reminders_on: true, email_letters: true, auto_intake: true, auto_draft: true, lh_footer: 'דוקטור חנוך אלרן מספר רישיון 18425\nנוירוכירורג ילדים ומבוגרים מספר רישיון מומחה 12732\nמומחה לניתוחי מערכת עצבים מרכזית בגישה זעיר פולשניים\nמנהל המכון לחקר שינה S.M.L החרש 9 חדרה\nכתובת מרפאה: מגדל ספיר מתחם הבורסה, רחוב תובל 40 קומה 23 רמת גן', lh_cv: 'פרטי השכלתי ותפקידי:\nרופא ראשי מומחה בכיר במחלקה הנוירוכירורגית בבית-החולים איכילוב, 1995–2021.\nמומחה בנוירוכירורגיה משנת 1992 (מ.ר.מ. 12732).\nהשכלה והתמחות:\n1976–1982 – בית הספר לרפואה ע״ש סאקלר, אוניברסיטת תל-אביב.', use_banner: true, sign_final: true, cv_in_opinions: true, public_booking: true, deposit_amount: 300, deposit_hold_hours: 48, bank_details: 'בנק הפועלים (12)\nסניף 532\nחשבון 123456\nע״ש ד״ר אלרן חנוך', bit_phone: '052-4266440', pay_note: 'נא לציין בהעברה את מספר התיק.', open_registration: true, phone_appointments: true, sms_reminders: true,
};

/** Next working day at or after `offset` days from today. */
function workday(offset: number) {
  let n = dayNum(todayIL()) + offset;
  while (weekday(fromDayNum(n)) >= 5) n += offset >= 0 ? 1 : -1;
  return fromDayNum(n);
}
const at = (offset: number, time: string) => ilToUtc(offset === 0 ? todayIL() : workday(offset), time).toISOString();

type F = { name: string; kind: 'law' | 'broker' };
const F1: F = { name: 'כהן, לוי ושות׳ עורכי דין', kind: 'law' };
const F2: F = { name: 'משרד עו״ד מזרחי-ברק', kind: 'law' };
const F3: F = { name: 'אבי שלום – ליווי רפואי', kind: 'broker' };

let n = 1040;
function row(offset: number, time: string, name: string, type: ApptRow['referral_type'], status: ApptRow['status'], firm: F, price: number, paid: number, payer: ApptRow['payer'] = 'referrer'): ApptRow {
  n += 1;
  return { id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, case_no: n, starts_at: at(offset, time), referral_type: type, patient_name: name, status, payer, price, paid, firm_name: firm.name, firm_kind: firm.kind };
}

export const rows: ApptRow[] = [
  row(-21, '10:00', 'משה פרץ', 'legal', 'done', F1, 10000, 10000),
  row(-14, '09:30', 'רחל אברהם', 'nii', 'done', F2, 2500, 1000),
  row(-9, '11:00', 'יוסי דהן', 'summary', 'done', F3, 900, 0, 'patient'),
  row(-6, '12:30', 'נועה גבאי', 'nii', 'draft', F1, 2500, 0),
  row(-2, '09:00', 'דוד ביטון', 'referral', 'booked', F3, 600, 0),
  row(0, '09:30', 'ישראל ישראלי', 'nii', 'draft', F1, 2500, 1000),
  row(0, '11:00', 'מרים כהן', 'legal', 'booked', F2, 10000, 0),
  row(0, '12:30', 'אלון שמעוני', 'summary', 'booked', F3, 900, 900, 'patient'),
  row(1, '09:00', 'שרה לוי', 'referral', 'booked', F1, 600, 0),
  row(1, '10:30', 'עומר חדד', 'nii', 'booked', F3, 2500, 0),
  row(2, '09:30', 'תמר אוחיון', 'legal', 'booked', F2, 10000, 5000),
  row(4, '11:30', 'אבי מלכה', 'summary', 'booked', F1, 900, 0),
  row(3, '10:00', 'יעל ברגר', 'legal', 'pending', F2, 10000, 0),
  row(5, '12:00', 'רון אזולאי', 'nii', 'pending', F1, 2500, 0),
];

export const firmRows = rows.filter((r) => r.firm_name === F1.name);

export const caseDetail: CaseDetail = {
  details_at: "2026-10-26T08:00:00Z",
  ...rows[5],
  patient_id_number: '012345678',
  patient_dob: '1980-05-12',
  patient_phone: '050-1234567',
  notes: 'תאונת עבודה מ־03.2025: נפילה מסולם בגובה כ־2 מטר באתר בנייה.\nתביעה לביטוח לאומי לנכות מעבודה. מבקשים חוות דעת לגבי עמוד שדרה צווארי ושורשים עצביים, והקשר הסיבתי לתאונה.\nהוועדה הרפואית נקבעה לחודש הבא.',
  firm: { id: 'f1', name: F1.name, kind: 'law', contact_name: 'עו״ד דנה לוי', phone: '03-5551234', email: 'office@example.co.il', tax_id: '514000000' },
};

export const notes: NoteRow[] = [
  { id: 'n1', body: 'צירפנו גם סיכום מחלה מבית החולים מיום האירוע.', created_at: at(-1, '16:20'), kind: 'note' },
  { id: 'n2', body: '- החלטת הוועדה הרפואית הקודמת של ביטוח לאומי\n- תיעוד פיזיותרפיה מ־2025', created_at: at(-1, '18:00'), kind: 'request', resolved_at: null },
];

export const intake: IntakeRow = {
  status: 'done', error: '', doc_count: 4, started_at: at(-1, '16:23'), finished_at: at(-1, '16:25'),
  data: {
    summary: 'גבר בן 46, עובד בניין, שנפל מסולם מגובה כ־2 מטר בעבודה ב־03.2025. מאז סובל מכאבי צוואר עם הקרנה ליד שמאל ונימול באצבעות 1–2. ב־MRI בלט דיסק C5-C6 עם לחץ על שורש C6 משמאל, וב־EMG רדיקולופתיה C6 משמאל. המפנה מבקש חוות דעת לוועדה הרפואית של ביטוח לאומי לגבי נכות מעבודה והקשר הסיבתי לתאונה.',
    request: { goal: 'חוות דעת לוועדה הרפואית של ב.ל. – נכות מעבודה בעמ"ש צווארי וקשר סיבתי לתאונה', recipient: 'המוסד לביטוח לאומי, סניף חדרה', event: 'נפילה מסולם באתר בנייה', event_date: '2025-03-14',
      questions: ['האם קיים קשר סיבתי בין התאונה לבין הפגיעה בעמ"ש הצווארי?', 'מהי הנכות הרפואית לפי תקנות ב.ל.?', 'האם קיים מצב קודם שיש לנכות?'] },
    patient_check: [],
    diagnoses: [{ name: 'בלט דיסק C5-C6', date: '2025-04', source: 'MRI עמוד שדרה צווארי 04-2025.pdf' }, { name: 'רדיקולופתיה C6 משמאל', date: '2025-05', source: 'EMG גפיים עליונות.pdf' }],
    timeline: [
      { date: '2025-03-14', title: 'התאונה – פינוי למיון', detail: 'נפילה מסולם. CT צוואר ללא שבר. שוחרר עם משככי כאבים.', source: 'סיכום מחלה – בית חולים.pdf' },
      { date: '2025-04-02', title: 'MRI עמ"ש צווארי', detail: 'בלט דיסק C5-C6 עם לחץ על שורש C6 משמאל. שינויים ניווניים קלים C4-C5.', source: 'MRI עמוד שדרה צווארי 04-2025.pdf' },
      { date: '2025-05-20', title: 'EMG', detail: 'רדיקולופתיה C6 משמאל, פעילה חלקית.', source: 'EMG גפיים עליונות.pdf' },
      { date: '2025-06', title: 'הגשת תביעה לב.ל.', detail: 'טופס ב.ל. 200 – תביעה לנכות מעבודה.', source: 'טופס בל 200.jpg' },
    ],
    imaging: [
      { date: '2025-04-02', test: 'MRI עמ"ש צווארי', finding: 'בלט דיסק C5-C6 עם לחץ על שורש C6 משמאל', source: 'MRI עמוד שדרה צווארי 04-2025.pdf' },
      { date: '2025-05-20', test: 'EMG גפיים עליונות', finding: 'רדיקולופתיה C6 משמאל', source: 'EMG גפיים עליונות.pdf' },
    ],
    medications: ['Etodolac 400mg', 'Lyrica 75mg'],
    treatments: ['פיזיותרפיה (מוזכרת, ללא תיעוד)'],
    function_work: 'לא חזר לעבודה בבנייה מאז האירוע. מדווח על קושי בהרמת משאות.',
    red_flags: [
      { text: 'ב־MRI שינויים ניווניים ב־C4-C5 – לבחון מצב קודם לפני התאונה.', level: 'high' },
      { text: 'אין תיעוד רפואי מקופת החולים בין המיון ל־MRI (כ־3 שבועות).', level: 'medium' },
    ],
    missing: [
      { item: 'החלטת הוועדה הרפואית הקודמת של ביטוח לאומי', why: 'לדעת אילו אחוזים כבר נקבעו' },
      { item: 'תיעוד פיזיותרפיה', why: 'מוזכר במסמכים, אבל לא צורף' },
      { item: 'תיק רפואי מקופ"ח לשנתיים שלפני התאונה', why: 'לשלול מצב קודם בצוואר' },
    ],
    documents: [
      { file: 'MRI עמוד שדרה צווארי 04-2025.pdf', kind: 'MRI', date: '2025-04-02', gist: 'בלט C5-C6 עם לחץ שורשי משמאל.' },
      { file: 'סיכום מחלה – בית חולים.pdf', kind: 'סיכום מיון', date: '2025-03-14', gist: 'נפילה מסולם, CT ללא שבר.' },
    ],
    exam_focus: ['טווחי תנועה בצוואר (במעלות)', 'כוח ותחושה בדרמטום C6 משמאל, החזרים', 'מבחן ספרלינג', 'לשאול על כאבי צוואר לפני התאונה'],
    suggested_type: 'nii', type_note: '', readiness: 72,
  },
};

export const emails = [
  { id: 3, kind: 'doc_request', to_addr: 'dana@example.co.il', status: 'sent' as const, error: '', created_at: at(-1, '18:00') },
  { id: 2, kind: 'summons_firm', to_addr: 'dana@example.co.il', status: 'sent' as const, error: '', created_at: at(-4, '09:30') },
  { id: 1, kind: 'summons_patient', to_addr: 'israel@example.com', status: 'sent' as const, error: '', created_at: at(-4, '09:30') },
];

export const docs: DocRow[] = [
  { id: 'd1', file_name: 'MRI עמוד שדרה צווארי 04-2025.pdf', mime_type: 'application/pdf', size_bytes: 2_400_000, created_at: at(-3, '10:00') },
  { id: 'd2', file_name: 'סיכום מחלה – בית חולים.pdf', mime_type: 'application/pdf', size_bytes: 1_100_000, created_at: at(-3, '10:01') },
  { id: 'd3', file_name: 'EMG גפיים עליונות.pdf', mime_type: 'application/pdf', size_bytes: 650_000, created_at: at(-1, '16:21') },
  { id: 'd4', file_name: 'טופס בל 200.jpg', mime_type: 'image/jpeg', size_bytes: 820_000, created_at: at(-1, '16:22') },
];

export const payments: PaymentRow[] = [
  { id: 'p1', amount: 1000, method: 'transfer', paid_on: workday(-3), receipt_no: '64102', receipt_url: 'https://example.com/receipt', note: 'מקדמה' },
];

export const letter = {
  appointment_id: caseDetail.id,
  letter_type: 'nii' as const,
  recipient: 'המוסד לביטוח לאומי | סניף חדרה',
  subject: 'חוות דעת רפואית – נכות מעבודה',
  exam_notes: 'כוח 5/5 בארבע הגפיים. ירידה בתחושה בדרמטום C6 משמאל. ספרלינג חיובי משמאל. הגבלה בתנועות צוואר.',
  body: `המסמכים שעיינתי בהם:
- MRI עמוד שדרה צווארי (04.2025)
- סיכום מחלה מבית החולים (03.2025)
- EMG גפיים עליונות (05.2025)
רקע ותולדות:
בן 46, עובד בניין. ללא בעיות צוואר ידועות לפני האירוע.
תיאור האירוע:
ב־03.2025 נפל מסולם מגובה כ־2 מטר באתר העבודה. פונה לחדר מיון (סיכום מחלה, 03.2025).
ממצאי הבדיקה:
כוח 5/5 בארבע הגפיים. ירידה בתחושה בדרמטום C6 משמאל. ספרלינג חיובי משמאל. הגבלה בתנועות הצוואר.
מסקנות:
בלט דיסק C5-C6 עם לחץ על שורש C6 משמאל (MRI, 04.2025), התואם את התלונות ואת ממצאי הבדיקה.`,
  is_final: false,
  finalized_at: null,
};

export const firms = [
  { id: 'f1', name: F1.name, kind: 'law' as const, tax_id: '514000000', contact_name: 'עו״ד דנה לוי', phone: '03-5551234', email: 'office@example.co.il', active: true },
  { id: 'f2', name: F2.name, kind: 'law' as const, tax_id: '515000000', contact_name: 'עו״ד יוסי מזרחי', phone: '02-6661234', email: 'mb@example.co.il', active: true },
  { id: 'f3', name: F3.name, kind: 'broker' as const, tax_id: '031234567', contact_name: 'אבי שלום', phone: '054-7771234', email: 'avi@example.co.il', active: true },
];

export const users = [
  { id: 'u0', role: 'admin' as const, firm_id: null, full_name: 'אלי', email: 'admin@example.co.il', must_change_password: false, active: true },
  { id: 'u1', role: 'doctor' as const, firm_id: null, full_name: 'ד״ר אלרן חנוך', email: 'doctor@example.co.il', must_change_password: false, active: true },
  { id: 'u2', role: 'firm' as const, firm_id: 'f1', full_name: 'עו״ד דנה לוי', email: 'dana@example.co.il', must_change_password: false, active: true },
  { id: 'u3', role: 'firm' as const, firm_id: 'f1', full_name: 'עו״ד רון כהן', email: 'ron@example.co.il', must_change_password: true, active: true },
  { id: 'u4', role: 'firm' as const, firm_id: 'f2', full_name: 'עו״ד יוסי מזרחי', email: 'yossi@example.co.il', must_change_password: false, active: true },
  { id: 'u5', role: 'firm' as const, firm_id: 'f3', full_name: 'אבי שלום', email: 'avi@example.co.il', must_change_password: false, active: true },
];

export const log = [
  { id: 6, user_id: 'u1', who: 'ד״ר אלרן חנוך', action: 'ai_draft', entity: 'appointment', entity_id: caseDetail.id, details: null, at: at(0, '10:05') },
  { id: 5, user_id: 'u1', who: 'ד״ר אלרן חנוך', action: 'view_case', entity: 'appointment', entity_id: caseDetail.id, details: null, at: at(0, '10:02') },
  { id: 4, user_id: 'u0', who: 'אלי', action: 'payment', entity: 'appointment', entity_id: caseDetail.id, details: { amount: 1000, method: 'transfer' }, at: at(-3, '12:00') },
  { id: 3, user_id: 'u2', who: 'עו״ד דנה לוי', action: 'upload', entity: 'document', entity_id: null, details: null, at: at(-1, '16:21') },
  { id: 2, user_id: 'u2', who: 'עו״ד דנה לוי', action: 'note', entity: 'case_note', entity_id: null, details: null, at: at(-1, '16:20') },
  { id: 1, user_id: 'u2', who: 'עו״ד דנה לוי', action: 'book', entity: 'appointment', entity_id: caseDetail.id, details: null, at: at(-5, '09:12') },
];

export const blocks = [
  { id: 'b1', starts_at: at(1, '12:00'), ends_at: at(1, '14:00'), note: 'ניתוח' },
];

export const templates = [
  { id: 't1', title: 'בדיקה גופנית תקינה – עמ"ש צווארי', body: 'בדיקה גופנית:\nהליכה תקינה. טווחי תנועה מלאים. כוח 5/5.', letter_type: null },
  { id: 't2', title: 'קשר סיבתי – פסקת דיון', body: 'דיון:\nלאור התיעוד הרפואי הסמוך לאירוע…', letter_type: 'legal' as const },
];
