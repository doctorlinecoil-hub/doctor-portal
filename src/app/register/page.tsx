import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession, homeFor } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import AuthFrame from '@/components/AuthFrame';
import RegisterForm from './RegisterForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'הרשמה · ד״ר אלרן חנוך' };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  const { k } = await searchParams;
  const { claims, profile } = await getSession();
  // a signed-in office goes to its panel; the clinic's staff may open the page to see what visitors see
  if (claims && profile?.active && profile.role === 'firm') redirect(homeFor(profile.role));
  const staffView = !!(claims && profile?.active && profile.role !== 'firm');
  const { data: s } = await createAdminClient().from('settings').select('open_registration').eq('id', 1).maybeSingle();
  const open = s?.open_registration !== false;
  return (
    <AuthFrame>
      <div className="panel">
        <div><h1>הרשמה למערכת</h1><p className="muted" style={{ marginTop: 4 }}>משרדי עורכי דין, מתווכים, חברות ומטופלים. החשבון נפתח אחרי אישור המרפאה.</p></div>
        {staffView && <div className="callout"><div>אתם מחוברים כצוות המרפאה. כך נראה דף ההרשמה למבקרים (משרדים, מתווכים, חברות ומטופלים).</div></div>}
        {open ? <RegisterForm initialKind={k} /> : <div className="callout warn"><div>ההרשמה למערכת סגורה כרגע. אפשר לקבוע תור גם בלי חשבון.</div></div>}
      </div>
      <div className="auth-links"><span>כבר יש לכם חשבון? <a href="/login"><b>כניסה</b></a></span><a href="/book">קביעת תור בלי חשבון</a></div>
    </AuthFrame>
  );
}
