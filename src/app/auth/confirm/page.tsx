import AuthFrame from '@/components/AuthFrame';

export const dynamic = 'force-dynamic';

/**
 * The sign-in link from the email opens this page, and the sign-in happens only when its owner presses the button
 * (a plain link can't sign anyone in silently, and mail scanners that open links don't use up the code).
 */
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string }> }) {
  const { token_hash = '' } = await searchParams;
  return (
    <AuthFrame>
      <div className="panel">
        <div><h1>כניסה למערכת</h1><p className="muted" style={{ marginTop: 4 }}>לחצו כדי להיכנס לחשבון שלכם.</p></div>
        {token_hash ? (
          <form method="post" action="/auth/verify" className="stack">
            <input type="hidden" name="token_hash" value={token_hash} />
            <button className="btn btn-primary btn-lg" type="submit">כניסה</button>
          </form>
        ) : <div className="callout bad"><div>הקישור לא תקין. בקשו קוד חדש במסך הכניסה.</div></div>}
      </div>
      <div className="auth-links"><a href="/login">חזרה למסך הכניסה</a></div>
    </AuthFrame>
  );
}
