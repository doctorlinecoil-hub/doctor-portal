import { createAdminClient } from '@/lib/supabase/admin';
import { serviceRoleKey } from '@/lib/env';
import AuthFrame from '@/components/AuthFrame';
import SetupForm from './SetupForm';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  let ready = false;
  let problem = '';
  if (!serviceRoleKey()) problem = 'חסר מפתח השירות של Supabase בהגדרות Vercel.';
  else if (!process.env.SETUP_CODE || process.env.SETUP_CODE.length < 8) problem = 'צריך להגדיר ב־Vercel את SETUP_CODE (8 תווים לפחות).';
  else {
    const admin = createAdminClient();
    const { data, error } = await admin.from('settings').select('bootstrapped').eq('id', 1).maybeSingle();
    if (error || !data) problem = 'המאגר עוד לא מוכן. ודאו שהפריסה האחרונה הצליחה.';
    else ready = !data.bootstrapped;
  }
  return (
    <AuthFrame>
      <div className="panel">
        <div><h1>יצירת מנהל המערכת</h1><p className="muted" style={{ marginTop: 4 }}>הגדרה ראשונה, פעם אחת בלבד</p></div>
        {problem ? <div className="callout warn"><div>{problem}</div></div> : ready ? <SetupForm /> : <p>המערכת כבר הוגדרה. <a href="/login">לכניסה</a></p>}
      </div>
    </AuthFrame>
  );
}
