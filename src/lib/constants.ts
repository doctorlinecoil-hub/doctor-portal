export type Role = 'admin' | 'doctor' | 'firm';
export type ReferralType = 'referral' | 'summary' | 'nii' | 'legal';
export type ApptStatus = 'pending' | 'booked' | 'draft' | 'done' | 'cancelled';
export type Payer = 'referrer' | 'patient';
export type PayMethod = 'transfer' | 'bit' | 'check' | 'cash' | 'card' | 'other';
export type ReferrerKind = 'law' | 'broker' | 'company' | 'private' | 'patient';
export type PayState = 'free' | 'unpaid' | 'partial' | 'paid';

export const KIND: Record<ReferrerKind, string> = { law: 'משרד עורכי דין', broker: 'מתווך', company: 'חברה', private: 'פנייה ישירה', patient: 'מטופל' };
/** Accounts of patients (not referrers): they pay a deposit when booking. */
export const isPatientKind = (k: string | null | undefined) => k === 'private' || k === 'patient';
export const PAYERS: Record<Payer, string> = { referrer: 'המפנה', patient: 'המטופל' };
export const PAY_METHODS: Record<PayMethod, string> = {
  transfer: 'העברה בנקאית', bit: 'ביט', check: 'צ׳ק', cash: 'מזומן', card: 'כרטיס אשראי', other: 'אחר',
};
export const PAY_STATE: Record<PayState, string> = { free: 'ללא חיוב', unpaid: 'לא שולם', partial: 'שולם חלקית', paid: 'שולם' };

export function payState(price: number, paid: number): PayState {
  if (!price || price <= 0) return 'free';
  if (paid <= 0) return 'unpaid';
  if (paid + 0.001 < price) return 'partial';
  return 'paid';
}

const ilsFmt = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2, minimumFractionDigits: 0 });
export const ils = (n: number | string | null | undefined) => ilsFmt.format(Number(n || 0));

export const TYPES: Record<ReferralType, { label: string; desc: string; icon: string }> = {
  referral: { label: 'הפניה לבדיקות', desc: 'הפניה ל־MRI, CT, EMG או בדיקות אחרות', icon: 'activity' },
  summary: { label: 'סיכום ביקור', desc: 'סיכום אחרי בדיקה במרפאה', icon: 'stethoscope' },
  nii: { label: 'חוות דעת לביטוח לאומי', desc: 'חוות דעת רפואית לוועדה של המל״ל', icon: 'building' },
  legal: { label: 'חוות דעת משפטית', desc: 'חוות דעת מומחה לבית משפט', icon: 'scale' },
};

/** Before the referrer picks the reason, a case has no type yet. */
const TYPE_PENDING = { label: 'סיבת הפניה טרם נבחרה', desc: '', icon: 'clock' };
/** Safe lookup: works also for a case that has no type yet. */
export const typeOf = (t: ReferralType | null | undefined | string) => (t && t in TYPES ? TYPES[t as ReferralType] : TYPE_PENDING);

export const STATUS_FIRM: Record<ApptStatus, string> = {
  pending: 'ממתין לאישור הרופא', booked: 'תור מאושר', draft: 'בטיפול הרופא', done: 'המכתב מוכן', cancelled: 'בוטל',
};
export const STATUS_STAFF: Record<ApptStatus, string> = {
  pending: 'ממתין לאישורך', booked: 'ממתין לביקור', draft: 'מכתב בטיוטה', done: 'המכתב נשלח', cancelled: 'בוטל',
};

export type WeekDay = { on: boolean; from: string; to: string };
export type Settings = {
  slot_minutes: number;
  horizon_days: number;
  notice_hours: number;
  weekly: Record<string, WeekDay>;
  blocked_dates: string[];
  require_staff_mfa: boolean;
  max_open_per_firm: number;
  prices: Record<ReferralType, number>;
  letter_requires_payment: boolean;
  invoice_item: string;
  require_approval: boolean;
  /** the clinic's notification addresses, comma separated (empty = the doctor's account email) */
  notify_email: string;
  /** the doctor's standing instructions for the AI, per document type ('all' applies to every document) */
  ai_style: Partial<Record<'all' | ReferralType, string>>;
  bring_items: string;
  summons_note: string;
  reminders_on: boolean;
  email_letters: boolean;
  auto_intake: boolean;
  auto_draft: boolean;
  lh_name: string;
  lh_titles: string;
  lh_licenses: string;
  lh_address: string;
  lh_phone: string;
  lh_email: string;
  lh_education: string;
  lh_footer: string;
  lh_cv: string;
  use_banner: boolean;
  sign_final: boolean;
  cv_in_opinions: boolean;
  public_booking: boolean;
  deposit_amount: number;
  deposit_hold_hours: number;
  /** a referrer may move or cancel a confirmed appointment until this many business days before it */
  change_business_days: number;
  /** the referrer's change policy for confirmed appointments */
  allow_reschedule: boolean;
  allow_cancel: boolean;
  cancel_days: number;
  change_days_unit: 'business' | 'calendar';
  /** 0 = no limit */
  max_reschedules: number;
  daily_digest: boolean;
  /** 0 = off */
  auto_pay_reminder_days: number;
  policy_in_summons: boolean;
  bank_details: string;
  bit_phone: string;
  pay_note: string;
  open_registration: boolean;
  phone_appointments: boolean;
  sms_reminders: boolean;
};

export const BUCKET = 'case-files';
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';
export const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

const DB_ERRORS: Record<string, string> = {
  SLOT_DAY_CLOSED: 'המרפאה סגורה ביום הזה. בחרו יום אחר.',
  SLOT_DAY_BLOCKED: 'היום הזה חסום. בחרו יום אחר.',
  SLOT_INVALID_TIME: 'השעה הזו לא מתאימה ללוח הזמנים של המרפאה.',
  SLOT_TOO_SOON: 'התור קרוב מדי. בחרו תור מאוחר יותר.',
  SLOT_TOO_FAR: 'התור רחוק מדי. בחרו תור קרוב יותר.',
  TOO_MANY_BOOKINGS: 'הגעתם למספר המרבי של תורים פתוחים. לקביעת תורים נוספים צרו קשר עם המרפאה.',
  CANNOT_CANCEL: 'אי אפשר לבטל את התור הזה.',
  CANNOT_APPROVE: 'הבקשה כבר טופלה.',
  DEPOSIT_REQUIRED: 'אי אפשר לאשר את התור לפני שהמקדמה התקבלה. סמנו קודם ״המקדמה התקבלה״.',
  SERVICE_LOCKED: 'אחרי שהמרפאה אישרה את התור אי אפשר להחליף את סוג השירות. לשינוי פנו למרפאה.',
  BAD_AMOUNT: 'סכום לא תקין.',
  SLOT_TAKEN: 'המועד הזה כבר תפוס. בחרו מועד אחר.',
  CANNOT_RESCHEDULE: 'אי אפשר לשנות את המועד של התור הזה.',
  TOO_LATE_TO_CHANGE: 'המועד האחרון לשינוי או ביטול דרך המערכת עבר. לשינוי צרו קשר עם המרפאה.',
  RESCHEDULE_DISABLED: 'שינוי מועד של תור שאושר נעשה מול המרפאה בלבד. צרו קשר עם המרפאה.',
  CANCEL_DISABLED: 'ביטול של תור שאושר נעשה מול המרפאה בלבד. צרו קשר עם המרפאה.',
  TOO_MANY_RESCHEDULES: 'מועד התור הזה כבר שונה את מספר הפעמים המרבי. לשינוי נוסף צרו קשר עם המרפאה.',
  CANNOT_DECLINE: 'הבקשה כבר טופלה.',
  IN_PAST: 'אי אפשר לבטל תור שכבר עבר.',
  FORBIDDEN: 'אין לכם הרשאה לפעולה הזו.',
  NOT_FOUND: 'התיק לא נמצא.',
  DETAILS_MISSING: 'חסרים פרטים: סיבת ההפניה, שם, תעודת זהות וטלפון.',
  CANNOT_EDIT: 'אי אפשר לשנות את פרטי התיק הזה.',
  NOT_ALLOWED: 'אין לכם הרשאה לפעולה הזו.',
};

export function dbError(e: { code?: string; message?: string } | null | undefined): string {
  if (!e) return '';
  if (e.code === '23505' || e.code === '23P01') return 'התור הזה נתפס הרגע. בחרו תור אחר.';
  const key = Object.keys(DB_ERRORS).find((k) => e.message?.includes(k));
  if (key) return DB_ERRORS[key];
  if (e.code === '42501' || e.message?.includes('row-level security')) return 'אין לכם הרשאה לפעולה הזו.';
  return 'הפעולה נכשלה. בדקו את החיבור ונסו שוב.';
}

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Default settings for the new fields, for rows that predate them. */
export const SETTINGS_DEFAULTS = {
  require_approval: true,
  notify_email: '',
  ai_style: {},
  bring_items: 'תעודת זהות\nכל המסמכים הרפואיים הרלוונטיים, גם אם כבר הועלו למערכת\nרשימת תרופות עדכנית\nבדיקות הדמיה (דיסק או קישור לצפייה)',
  summons_note: '',
  reminders_on: true,
  email_letters: true,
  auto_intake: true,
  auto_draft: true,
  lh_footer: '',
  lh_cv: '',
  use_banner: true,
  sign_final: true,
  cv_in_opinions: true,
  public_booking: true,
  deposit_amount: 0,
  deposit_hold_hours: 48,
  change_business_days: 5,
  allow_reschedule: true,
  allow_cancel: true,
  cancel_days: 5,
  change_days_unit: 'business',
  max_reschedules: 0,
  daily_digest: true,
  auto_pay_reminder_days: 0,
  policy_in_summons: true,
  bank_details: '',
  bit_phone: '',
  pay_note: '',
  open_registration: true,
  phone_appointments: true,
  sms_reminders: true,
} as const;

/** Emoji and decorations pasted from WhatsApp, removed so the details read cleanly everywhere. */
const plain = (t: string) => t.replace(/[\p{Extended_Pictographic}\uFE0F\u200D\u20E3]/gu, '').replace(/^[\s•·*\-–]+/, '').replace(/\s+/g, ' ').trim();

/**
 * The clinic's payment details. bank = the "label: value" lines (בנק, סניף, חשבון, על שם);
 * any other sentence pasted there (a greeting, "thank you") joins the note. Empty when nothing was filled in.
 */
export function payLines(s: Pick<Settings, 'bank_details' | 'bit_phone' | 'pay_note'>) {
  const lines = String(s.bank_details || '').split('\n').map(plain).filter(Boolean);
  const bank = lines.filter((l) => /^[^:]{1,25}:\s*\S/.test(l));
  const extra = lines.filter((l) => !bank.includes(l) && !/^(נא לבצע|יש לבצע|פרטי העברה|📢)/.test(l));
  const note = [String(s.pay_note || '').split('\n').map(plain).filter(Boolean).join('\n'), ...extra.filter((l) => !/^תודה/.test(l))].filter(Boolean).join('\n');
  return { bank, bit: plain(String(s.bit_phone || '')), note };
}

/** The clinic's notification addresses (the settings field may hold several, separated by commas). */
export function notifyList(s: Pick<Settings, 'notify_email'>): string[] {
  return [...new Set(String(s.notify_email || '').split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s,]+@[^@\s,]+\.[^@\s,]+$/.test(e)))];
}
