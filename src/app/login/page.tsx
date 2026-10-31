import { redirect } from 'next/navigation';
import { getSession, homeFor } from '@/lib/auth';
import AuthFrame from '@/components/AuthFrame';
import LoginForm from './LoginForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string; code?: string; email?: string }> }) {
  const { e, code, email } = await searchParams;
  const { claims, profile } = await getSession();
  if (claims && profile?.active && e !== 'noaccess') redirect(homeFor(profile.role));
  return (
    <AuthFrame>
      <div className="panel">
        <div><h1>כניסה למערכת</h1><p className="muted" style={{ marginTop: 4 }}>כניסה עם סיסמה, או עם קוד שנשלח למייל</p></div>
        {e === 'link' && <div className="callout bad"><div>הקישור מהמייל כבר שומש או שפג תוקפו. בקשו קוד חדש.</div></div>}
        {e === 'noaccess' && <div className="callout bad"><div>לחשבון הזה אין גישה למערכת. פנו למרפאה.</div></div>}
        <LoginForm initialMode={code ? 'code' : 'password'} initialEmail={(email || '').slice(0, 200)} />
      </div>
      <div className="auth-links">
        <a href="/forgot">שכחתי סיסמה</a>
        <span>אין לכם חשבון? <a href="/register"><b>הרשמה</b></a></span>
      </div>
      <a className="btn btn-ghost auth-book" href="/book"><span>רק רוצים לקבוע תור? אפשר גם בלי חשבון</span></a>
    </AuthFrame>
  );
}
