import type { Metadata } from 'next';
import AuthFrame from '@/components/AuthFrame';
import ForgotForm from './ForgotForm';

export const metadata: Metadata = { title: 'שכחתי סיסמה · ד״ר אלרן חנוך' };

export default function ForgotPage() {
  return (
    <AuthFrame>
      <div className="panel">
        <div><h1>שכחתי סיסמה</h1><p className="muted" style={{ marginTop: 4 }}>נשלח סיסמה זמנית למייל שאיתו נרשמתם. נכנסים איתה, ומיד בוחרים סיסמה חדשה.</p></div>
        <ForgotForm />
      </div>
      <div className="auth-links"><a href="/login">חזרה לכניסה</a><a href="/register">הרשמה</a></div>
    </AuthFrame>
  );
}
