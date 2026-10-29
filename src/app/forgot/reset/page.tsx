import type { Metadata } from 'next';
import AuthFrame from '@/components/AuthFrame';
import { resetLinkOk } from '@/lib/accounts';
import ResetForm from './ResetForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'בחירת סיסמה חדשה · ד״ר אלרן חנוך', robots: { index: false } };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t = '' } = await searchParams;
  const ok = await resetLinkOk(t);
  return (
    <AuthFrame>
      <div className="panel">
        {ok ? (
          <>
            <div><h1>בחירת סיסמה חדשה</h1><p className="muted" style={{ marginTop: 4 }}>בחרו סיסמה של 10 תווים לפחות. אחרי השמירה מתחברים איתה.</p></div>
            <ResetForm token={t} />
          </>
        ) : (
          <>
            <div><h1>הקישור אינו בתוקף</h1><p className="muted" style={{ marginTop: 4 }}>הקישור פג תוקף (30 דקות) או שכבר נעשה בו שימוש. אפשר לבקש קישור חדש.</p></div>
            <a className="btn btn-primary btn-lg" href="/forgot">בקשת קישור חדש</a>
          </>
        )}
      </div>
      <div className="auth-links"><a href="/login">חזרה לכניסה</a></div>
    </AuthFrame>
  );
}
