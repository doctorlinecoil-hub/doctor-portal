import { redirect } from 'next/navigation';
import { getSession, homeFor } from '@/lib/auth';
import AuthFrame from '@/components/AuthFrame';
import MfaForm from './MfaForm';

export default async function MfaPage() {
  const { claims, profile } = await getSession();
  if (!claims || !profile) redirect('/login');
  if (profile.role === 'firm' || claims.aal === 'aal2') redirect(homeFor(profile.role));
  return (
    <AuthFrame>
      <div className="panel">
        <div><h1>אימות דו־שלבי</h1><p className="muted" style={{ marginTop: 4 }}>שכבת הגנה נוספת למידע הרפואי</p></div>
        <MfaForm />
      </div>
    </AuthFrame>
  );
}
