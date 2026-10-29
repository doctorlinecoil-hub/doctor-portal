import type { Metadata } from 'next';
import LegalPage, { clinic } from '@/components/LegalPage';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'הצהרת נגישות · ד״ר אלרן חנוך' };

export default async function AccessibilityPage() {
  const s = await clinic();
  return (
    <LegalPage s={s} title="הצהרת נגישות" updated="אוקטובר 2026">
      <p>המרפאה של {s.lh_name} רואה חשיבות במתן שירות שוויוני לכל אדם, ופועלת להנגשת האתר בהתאם לתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע״ג-2013, ולתקן הישראלי 5568 ברמה AA.</p>
      <h2>מה הונגש באתר</h2>
      <ul>
        <li>מבנה כותרות ותגיות לקוראי מסך, ותוויות לכל שדה בטפסים.</li>
        <li>ניווט מלא במקלדת, וסימון ברור של הרכיב הפעיל.</li>
        <li>ניגודיות צבעים מספקת וטקסט שניתן להגדלה עד 200% בלי פגיעה בתוכן.</li>
        <li>התאמה לטלפונים ולמסכים קטנים, ותמיכה בהעדפת ״הפחתת תנועה״.</li>
      </ul>
      <h2>הנגשת המרפאה</h2>
      <p>{s.lh_address ? `המרפאה נמצאת ב${s.lh_address}. ` : ''}לפרטים על נגישות המבנה ועל התאמות לביקור, אפשר לפנות אלינו מראש.</p>
      <h2>נתקלתם בבעיה?</h2>
      <p>אם מצאתם רכיב שאינו נגיש, נשמח לשמוע ולתקן{[s.lh_phone && ` · טלפון: ${s.lh_phone}`, s.lh_email && ` · מייל: ${s.lh_email}`].filter(Boolean).join('')}.</p>
    </LegalPage>
  );
}
