'use client';
import { useActionState } from 'react';
import { createFirstAdmin } from './actions';

export default function SetupForm() {
  const [state, action, pending] = useActionState(createFirstAdmin, null);
  if (state?.ok) return <p className="callout">המנהל נוצר. <a href="/login">להתחברות</a></p>;
  return (
    <form action={action} className="stack">
      <p className="muted">העמוד הזה עובד פעם אחת בלבד. אחרי שיוצרים מנהל, הוא נסגר.</p>
      <label className="field" htmlFor="code"><span>קוד הגדרה <small>(SETUP_CODE מ־Vercel)</small></span><input id="code" name="code" type="password" dir="ltr" /></label>
      <label className="field" htmlFor="name"><span>שם מלא</span><input id="name" name="name" /></label>
      <label className="field" htmlFor="email"><span>אימייל</span><input id="email" name="email" type="email" dir="ltr" /></label>
      <label className="field" htmlFor="password"><span>סיסמה <small>10 תווים לפחות</small></span><input id="password" name="password" type="password" dir="ltr" autoComplete="new-password" /></label>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      <button className="btn btn-primary btn-lg" type="submit" disabled={pending}>{pending ? 'יוצר…' : 'יצירת מנהל'}</button>
    </form>
  );
}
