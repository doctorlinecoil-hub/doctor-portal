/** Turns an AI API error into a short Hebrew explanation of what to do. */
export function aiErrorText(raw: unknown) {
  const m = String((raw as Error)?.message ?? raw ?? '');
  if (/authentication_error|invalid x-api-key|invalid api key|401/i.test(m)) return 'מפתח ה־AI לא תקין. צריך להדביק מחדש את ANTHROPIC_API_KEY ב־Vercel (מפתח שמתחיל ב־sk-ant-) ולפרוס מחדש.';
  if (/credit balance|billing|402/i.test(m)) return 'אין יתרה בחשבון ה־AI. צריך להטעין קרדיט ב־console.anthropic.com (Billing).';
  if (/permission_error|403/i.test(m)) return 'למפתח ה־AI אין הרשאה למודל. בדקו את המפתח ב־console.anthropic.com.';
  if (/not_found_error|model/i.test(m) && /404/.test(m)) return 'המודל שהוגדר ב־ANTHROPIC_MODEL לא קיים. מחקו את המשתנה כדי לחזור לברירת המחדל.';
  if (/rate_limit|429|overloaded|529/i.test(m)) return 'שירות ה־AI עמוס כרגע. נסו שוב בעוד דקה.';
  if (/request_too_large|413|too long|prompt is too long/i.test(m)) return 'המסמכים גדולים מדי לקריאה בבת אחת. נסו להעלות פחות מסמכים או קבצים קטנים יותר.';
  return 'תקלה בשירות ה־AI. נסו שוב.';
}

export const isAuthError = (m: string) => /authentication_error|invalid x-api-key|מפתח ה־AI לא תקין/i.test(m || '');
