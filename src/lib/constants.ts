export type Role = 'admin' | 'doctor' | 'firm';
export type ReferralType = 'referral' | 'summary' | 'nii' | 'legal';
export type ApptStatus = 'pending' | 'booked' | 'draft' | 'done' | 'cancelled';
export type Payer = 'referrer' | 'patient';
export type PayMethod = 'transfer' | 'bit' | 'check' | 'cash' | 'card' | 'other';
export type ReferrerKind = 'law' | 'broker' | 'private';
export type PayState = 'free' | 'unpaid' | 'partial' | 'paid';

export const KIND: Record<ReferrerKind, string> = { law: 'משרד עורכי דין', broker: 'מתווך', private: 'פנייה ישירה' };
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
  notify_email: string;
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
  TOO_MANY_BOOKINGS: 'למשרד יש כבר הרבה תורים פתוחים. פנו למרפאה.',
  CANNOT_CANCEL: 'אי אפשר לבטל את התור הזה.',
  CANNOT_APPROVE: 'הבקשה כבר טופלה.',
  SLOT_TAKEN: 'המועד הזה כבר תפוס. בחרו מועד אחר.',
  CANNOT_RESCHEDULE: 'אי אפשר לשנות את המועד של התור הזה.',
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
  bring_items: 'תעודת זהות\nכל המסמכים הרפואיים הרלוונטיים, גם אם כבר הועלו למערכת\nרשימת תרופות עדכנית\nבדיקות הדמיה (דיסק או קישור לצפייה)',
  summons_note: '',
  reminders_on: true,
  email_letters: true,
  auto_intake: true,
  auto_draft: true,
} as const;
