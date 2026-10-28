import { redirect } from 'next/navigation';
import { getSession, homeFor } from '@/lib/auth';
import AuthFrame from '@/components/AuthFrame';
import LoginForm from './LoginForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  const { claims, profile } = await getSession();
  if (claims && profile?.active && e !== 'noaccess') redirect(homeFor(profile.role));
  return (
    <AuthFrame>
      <div className="panel">
        <div><h1>כניסה למערכת</h1><p className="muted" style={{ marginTop: 4 }}>הזינו את פרטי הכניסה שקיבלתם מהמרפאה</p></div>
        {e === 'noaccess' && <div className="callout bad"><div>לחשבון הזה אין גישה למערכת. פנו למרפאה.</div></div>}
        <LoginForm />
      </div>
      <p className="hint" style={{ textAlign: 'center' }}>שכחתם סיסמה? פנו למרפאה ותקבלו סיסמה חדשה.</p>
    </AuthFrame>
  );
}
