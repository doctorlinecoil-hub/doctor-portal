import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import AuthFrame from '@/components/AuthFrame';
import SetPasswordForm from './SetPasswordForm';

export default async function SetPasswordPage() {
  const { supabase, claims, profile } = await getSession();
  if (!claims || !profile) redirect('/login');
  if (profile.role !== 'firm' && claims.aal !== 'aal2') {
    const { data: s } = await supabase.from('settings').select('require_staff_mfa').eq('id', 1).maybeSingle();
    if (s?.require_staff_mfa !== false) redirect('/mfa');
  }
  return (
    <AuthFrame>
      <div className="panel">
        <div><h1>בחירת סיסמה</h1><p className="muted" style={{ marginTop: 4 }}>{profile.must_change_password ? 'קיבלתם סיסמה זמנית. בחרו עכשיו סיסמה משלכם.' : 'כאן מחליפים את הסיסמה שלכם.'}</p></div>
        <SetPasswordForm />
      </div>
    </AuthFrame>
  );
}
