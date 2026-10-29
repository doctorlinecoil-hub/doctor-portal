import type { ReferralType, Settings } from './constants';
import { TYPES } from './constants';
import { age, fmtDate, todayIL } from './dates';

export const LEGAL_DECLARATION =
  'אני נותן חוות דעתי זו במקום עדות בשבועה בבית משפט, ואני מצהיר בזה כי ידוע לי היטב שלעניין הוראות החוק הפלילי בדבר עדות שקר בשבועה בבית משפט, דין חוות דעת זו כשהיא חתומה על ידי כדין עדות בשבועה שנתתי בבית משפט.';

const STRUCT: Record<ReferralType, string> = {
  referral: `מסמך קצר, עד עמוד אחד.
נמען: מכון הדימות, מעבדת EMG או המחלקה המתאימה לבדיקה.
סעיפים:
רקע רפואי בקצרה:
תלונות עיקריות:
ממצאים רלוונטיים:
הבדיקות המבוקשות: (כל בדיקה בשורה נפרדת, עם האזור והסיבה. לדוגמה: "- MRI עמוד שדרה צווארי – לבירור לחץ על שורשים עצביים")
השאלה הקלינית:
דחיפות:
הצע בדיקות רק לפי התלונות והממצאים, וסמן ליד כל הצעה [לאישור הרופא].`,
  summary: `נמען: המפנה (משרד עורכי הדין) או רופא/ת המשפחה, לפי ההקשר.
סעיפים:
סיבת הפנייה:
רקע ותולדות:
תלונות נוכחיות:
טיפול תרופתי:
בדיקה גופנית:
בדיקות עזר והדמיה: (לפי סדר כרונולוגי, עם תאריכים)
התרשמות ואבחנות:
המלצות:
מעקב:`,
  nii: `נמען: המוסד לביטוח לאומי (אם ידוע – הסניף או סוג הוועדה).
סעיפים:
המסמכים שעיינתי בהם:
רקע ותולדות:
תיאור האירוע או המחלה:
תלונות נוכחיות והשפעה על התפקוד:
ממצאי הבדיקה:
סיכום המסמכים הרפואיים: (כרונולוגי, עם תאריכים)
דיון:
מסקנות: (אבחנות; קשר סיבתי לאירוע אם רלוונטי; הצעה לנכות רפואית לפי תקנות הביטוח הלאומי (קביעת דרגת נכות לנפגעי עבודה), תשט"ז-1956 – סעיף, פריט ואחוז – רק אם יש לכך בסיס בממצאים, ותמיד עם [לאישור הרופא]; השפעה על כושר העבודה)`,
  legal: `נמען: בית המשפט הנכבד, או ב"כ הצד שהזמין את חוות הדעת (לפי הערות המפנה).
פתיחה: משפט אחד – מי ביקש את חוות הדעת ובעניין מה.
סעיפים:
פרטי המומחה: {EDUCATION}
העדר עניין: (שורה אחת: אין לי עניין אישי בתוצאות ההליך)
המסמכים שעמדו לפניי:
תולדות ורקע:
נסיבות האירוע:
תלונות נוכחיות:
ממצאי הבדיקה:
סיכום הממצאים הרפואיים: (כרונולוגי, עם תאריכים)
דיון:
קשר סיבתי:
נכות רפואית: (לפי תקנות הביטוח הלאומי (קביעת דרגת נכות לנפגעי עבודה), תשט"ז-1956 – סעיף ואחוז, עם [לאישור הרופא])
השלכות תפקודיות ותעסוקתיות:
צרכים עתידיים: (טיפולים, בדיקות, תרופות, עזרה)
סיכום ומסקנות:`,
};

export type PromptInput = {
  letterType: ReferralType;
  exam: string;
  settings: Pick<Settings, 'lh_name' | 'lh_titles' | 'lh_education'>;
  visitDate: string;
  patient: { name: string; idNumber: string; dob: string | null };
  firmName: string;
  notes: string[];
  attached: string[];
  skipped: string[];
  intake?: string;
};

export function buildPrompt(p: PromptInput) {
  const doctor = p.settings.lh_name + (p.settings.lh_titles ? ' – ' + p.settings.lh_titles.replace(/\n+/g, '; ') : '');
  const a = age(p.patient.dob);
  const struct = STRUCT[p.letterType].replace(
    '{EDUCATION}',
    p.settings.lh_education ? `(השתמש בטקסט הזה: ${p.settings.lh_education.replace(/\n+/g, ' ')})` : '[להשלמת הרופא: השכלה וניסיון]',
  );
  const docs = p.attached.length ? `המסמכים המצורפים, לפי הסדר:\n${p.attached.map((n, i) => `${i + 1}. ${n}`).join('\n')}` : 'לא צורפו מסמכים.';
  const skipped = p.skipped.length
    ? `\nהמסמכים האלה לא נשלחו אליך (גודל או קובץ שלא נקרא): ${p.skipped.join(', ')}. ציין בסוף הטיוטה: [לבדיקת הרופא: מסמכים שלא נקראו].`
    : '';
  return [
    'אתה עוזר לרופא מומחה לנסח מסמך רפואי בעברית. הרופא יקרא, יתקן ויחתום. המטרה: טיוטה מדויקת שחוסכת לו זמן.',
    `הרופא: ${doctor}`,
    `סוג המסמך: ${TYPES[p.letterType].label}`,
    `תאריך הביקור: ${fmtDate(p.visitDate)}. תאריך היום: ${fmtDate(todayIL())}.`,
    `המטופל/ת: ${p.patient.name}, ת.ז. ${p.patient.idNumber || 'לא צוין'}, ${p.patient.dob ? `תאריך לידה ${fmtDate(p.patient.dob)} (גיל ${a})` : 'תאריך לידה לא צוין'}.`,
    `המפנה: ${p.firmName || 'משרד עורכי דין'}`,
    `בקשת המפנה והערותיו:\n"""\n${p.notes.filter(Boolean).join('\n') || '(אין הערות)'}\n"""`,
    `ממצאי הרופא מהבדיקה:\n"""\n${p.exam.trim() || '(הרופא עוד לא רשם ממצאים)'}\n"""`,
    docs + skipped,
    p.intake ? `סיכום מקדים של התיק שהוכן בסריקה אוטומטית (עזר בלבד – המקור הקובע הוא המסמכים עצמם):\n"""\n${p.intake}\n"""` : '',
    `כללים:
1. השתמש רק במידע מהמסמכים, מבקשת המפנה ומממצאי הרופא. אל תמציא ממצאים, תוצאות, תאריכים, אבחנות או אחוזי נכות.
2. איפה שחסר מידע שהרופא צריך להשלים, כתוב בסוגריים מרובעים: [להשלמת הרופא: ...].
3. ממצאי בדיקה גופנית נכתבים רק מתוך "ממצאי הרופא מהבדיקה". אם אין – כתוב [להשלמת הרופא: ממצאי הבדיקה].
4. כשאתה מביא ממצא ממסמך, ציין בקצרה מקור ותאריך, למשל: (MRI עמ"ש מותני, 03.2025).
5. שפה רפואית פשוטה, ישירה ועניינית. משפטים קצרים. בלי מליצות ובלי חזרות.
6. כתוב בגוף ראשון בשם הרופא כשזה מתאים ("בדקתי", "לדעתי").
7. טקסט רגיל בלבד: בלי Markdown, בלי כוכביות ובלי #. כותרת סעיף = שורה קצרה שמסתיימת בנקודתיים. פריט ברשימה = שורה שמתחילה ב-"- ".
8. אל תכתוב נייר מכתבים, תאריך, פרטי מטופל, חתימה או הצהרה. המערכת מוסיפה אותם.`,
    `מבנה לסוג המסמך הזה:\n${struct}`,
    `פורמט התשובה, בדיוק כך:
לכבוד: <הנמען. אם יש כמה שורות, הפרד ביניהן ב-" | ">
הנדון: <נושא קצר>
---
<גוף המכתב>`,
  ].filter(Boolean).join('\n\n');
}

export function parseDraft(text: string) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const sep = lines.findIndex((l) => l.trim() === '---');
  let recipient = '';
  let subject = '';
  let body = text;
  if (sep >= 0 && sep < 10) {
    for (const raw of lines.slice(0, sep)) {
      const l = raw.trim();
      if (l.startsWith('לכבוד:')) recipient = l.slice(6).trim();
      else if (l.startsWith('הנדון:')) subject = l.slice(6).trim();
    }
    body = lines.slice(sep + 1).join('\n');
  }
  body = body.replace(/\*\*/g, '').replace(/^#+\s*/gm, '').trim();
  return { recipient, subject, body };
}

export type Block = { kind: 'h' | 'p' | 'li'; text: string };
export function bodyBlocks(body: string): Block[] {
  const out: Block[] = [];
  for (const raw of String(body || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (/^[-•]\s+/.test(line)) out.push({ kind: 'li', text: line.replace(/^[-•]\s+/, '') });
    else if (line.length <= 70 && /[:：]$/.test(line)) out.push({ kind: 'h', text: line });
    else out.push({ kind: 'p', text: line });
  }
  return out;
}

export const PLACEHOLDER_RE = /\[(להשלמת|לאישור|לבדיקת) הרופא/;

/** The section headings for a letter type, to start writing by hand (without the AI). */
export function outlineFor(type: ReferralType, education = ''): string {
  const heads = STRUCT[type].split('\n').map((l) => l.trim()).filter((l) => /^[^\s].{1,60}:/.test(l) && !l.startsWith('נמען') && !l.startsWith('סעיפים') && !l.startsWith('פתיחה'));
  return heads.map((l) => {
    const h = l.slice(0, l.indexOf(':') + 1);
    if (h.startsWith('פרטי המומחה')) return `${h}\n${education || '[להשלמת הרופא: השכלה וניסיון]'}`;
    return `${h}\n`;
  }).join('\n');
}
