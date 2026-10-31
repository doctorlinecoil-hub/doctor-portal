import tls from 'node:tls';
import { requireUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { mailEnabled, appUrl } from '@/lib/mail';
import { morningEnabled } from '@/lib/morning';
import { smsEnabled } from '@/lib/sms';
import { inboundEnabled } from '@/lib/inbound';
import { supabaseConfig } from '@/lib/env';
import { fmtStamp } from '@/lib/dates';
import { PageHead } from '@/components/ui';
import SystemMap, { type Svc } from './SystemMap';

export const dynamic = 'force-dynamic';

/** When does the site's security certificate run out (it renews by itself on Vercel)? */
function certExpiry(host: string): Promise<string | null> {
  return new Promise((resolve) => {
    const s = tls.connect({ host, port: 443, servername: host, timeout: 5000 }, () => {
      const c = s.getPeerCertificate(); s.end(); resolve(c?.valid_to ? new Date(c.valid_to).toISOString() : null);
    });
    s.on('error', () => resolve(null)); s.on('timeout', () => { s.destroy(); resolve(null); });
  });
}

const ago = (iso?: string | null) => {
  if (!iso) return null;
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `לפני ${m} דק׳` : m < 48 * 60 ? `לפני ${Math.round(m / 60)} שעות` : `לפני ${Math.round(m / 1440)} ימים`;
};

/** The system map: every service the site runs on, where to manage it, renewals, and a live health check. */
export default async function SystemPage() {
  const { settings } = await requireUser(['admin']);
  const db = createAdminClient();
  const host = new URL(appUrl()).hostname;
  const ref = (supabaseConfig().url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1] || '';
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: notesRow } = await db.from('admin_notes').select('data').eq('id', 1).maybeSingle();
  const [cert, dbOk, lastMail, failedMail, lastBackup, lastAi, lastDigest] = await Promise.all([
    certExpiry(host),
    db.from('settings').select('id').eq('id', 1).maybeSingle().then((r) => !r.error),
    db.from('email_log').select('created_at').eq('status', 'sent').order('created_at', { ascending: false }).limit(1).maybeSingle().then((r) => r.data?.created_at as string | undefined),
    db.from('email_log').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('created_at', since).then((r) => r.count ?? 0),
    db.from('email_log').select('created_at').like('kind', 'backup_%').eq('status', 'sent').order('created_at', { ascending: false }).limit(1).maybeSingle().then((r) => r.data?.created_at as string | undefined),
    db.from('audit_log').select('at').in('action', ['ai_draft', 'ai_refine', 'intake']).order('at', { ascending: false }).limit(1).maybeSingle().then((r) => r.data?.at as string | undefined),
    db.from('email_log').select('created_at').like('kind', 'digest_%').eq('status', 'sent').order('created_at', { ascending: false }).limit(1).maybeSingle().then((r) => r.data?.created_at as string | undefined),
  ]);
  const tick = (settings as { last_tick?: string | null }).last_tick;
  const tickOk = !!tick && Date.now() - new Date(tick).getTime() < 25 * 60_000;
  const certDays = cert ? Math.round((new Date(cert).getTime() - Date.now()) / 86400_000) : null;

  const services: Svc[] = [
    { key: 'domain', icon: 'externalLink', name: 'הדומיין', what: `${host} – הכתובת של האתר. מתחדש פעם בשנה אצל רשם הדומיינים.`,
      status: certDays == null ? 'warn' : 'ok', live: certDays == null ? 'לא הצלחנו לבדוק את תעודת האבטחה' : `האתר מאובטח (HTTPS). התעודה מתחדשת לבד, בתוקף עוד ${certDays} ימים`,
      links: [{ label: 'הגדרות דומיין ב־Vercel', href: 'https://vercel.com/doctorlinecoil/doctor-portal/settings/domains' }] },
    { key: 'hosting', icon: 'activity', name: 'האחסון והשרת (Vercel)', what: 'השרת שמריץ את האתר והמערכת. כל עדכון עולה לאוויר אוטומטית.',
      status: 'ok', live: `פעיל · גרסה ${(process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || 'מקומית'}${process.env.VERCEL_REGION ? ` · אזור ${process.env.VERCEL_REGION}` : ''}`,
      links: [{ label: 'לוח הבקרה', href: 'https://vercel.com/doctorlinecoil/doctor-portal' }, { label: 'חיוב ומנוי', href: 'https://vercel.com/doctorlinecoil/~/settings/billing' }] },
    { key: 'database', icon: 'shield', name: 'מסד הנתונים והקבצים (Supabase)', what: 'כל התיקים, המסמכים, התשלומים והמשתמשים. מוצפן ומגובה.',
      status: dbOk ? 'ok' : 'bad', live: dbOk ? 'מחובר ועובד' : 'אין חיבור למסד הנתונים!',
      links: ref ? [{ label: 'לוח הבקרה', href: `https://supabase.com/dashboard/project/${ref}` }, { label: 'חיוב ומנוי', href: 'https://supabase.com/dashboard/org/_/billing' }] : [] },
    { key: 'mail', icon: 'mail', name: 'שליחת מיילים (Resend)', what: 'זימונים, תזכורות, מסמכים, התראות לרופא וקודי כניסה.',
      status: !mailEnabled() ? 'bad' : failedMail > 5 ? 'warn' : 'ok',
      live: !mailEnabled() ? 'לא מוגדר – מיילים לא יוצאים!' : `מייל אחרון נשלח ${ago(lastMail) || '—'}${failedMail ? ` · ${failedMail} נכשלו בשבוע האחרון` : ''}`,
      links: [{ label: 'לוח הבקרה', href: 'https://resend.com/emails' }, { label: 'דומיין ושליחה', href: 'https://resend.com/domains' }, { label: 'חיוב', href: 'https://resend.com/settings/billing' }] },
    { key: 'inbound', icon: 'inbox', name: 'קבלת מיילים (תשובות עם אישורי העברה)', what: 'כשמשלם עונה למייל ומצרף אישור העברה – הקובץ נכנס לתיק לבד.',
      status: inboundEnabled() ? 'ok' : 'warn', live: inboundEnabled() ? 'פעיל' : 'כבוי – אישורים מתקבלים רק דרך הקישור',
      links: [{ label: 'Webhooks', href: 'https://resend.com/webhooks' }] },
    { key: 'cron', icon: 'clock', name: 'התזמון האוטומטי', what: 'תזכורות לפני תור, סיכום יומי וגיבוי ב־21:00, תזכורות תשלום. רץ כל 10 דקות.',
      status: tickOk ? 'ok' : 'bad', live: tick ? `ריצה אחרונה ${ago(tick)}${tickOk ? '' : ' – לא רץ! תזכורות לא יוצאות'}` : 'עוד לא נרשמה ריצה',
      links: ref ? [{ label: 'Cron ב־Supabase', href: `https://supabase.com/dashboard/project/${ref}/integrations/cron/jobs` }] : [] },
    { key: 'backup', icon: 'download', name: 'גיבוי יומי', what: 'כל ערב ב־21:00 נשלח גיבוי מלא במייל.',
      status: lastBackup && Date.now() - new Date(lastBackup).getTime() < 30 * 3600_000 ? 'ok' : 'warn', live: lastBackup ? `גיבוי אחרון ${ago(lastBackup)} (${fmtStamp(lastBackup)})` : 'עוד לא נשלח גיבוי',
      links: [] },
    { key: 'digest', icon: 'bell', name: 'סיכום יומי לרופא', what: 'כל ערב ב־21:00: התורים של מחר ומה ממתין.',
      status: settings.daily_digest ? (lastDigest ? 'ok' : 'warn') : 'off', live: !settings.daily_digest ? 'כבוי בהגדרות' : lastDigest ? `נשלח ${ago(lastDigest)}` : 'עוד לא נשלח', links: [] },
    { key: 'ai', icon: 'sparkles', name: 'בינה מלאכותית (Anthropic)', what: 'סריקת מסמכים, טיוטות מכתבים ובדיקת אסמכתאות. משלמים לפי שימוש.',
      status: process.env.ANTHROPIC_API_KEY ? 'ok' : 'bad', live: process.env.ANTHROPIC_API_KEY ? `מחובר${lastAi ? ` · שימוש אחרון ${ago(lastAi)}` : ''}` : 'לא מוגדר – ה־AI לא עובד',
      links: [{ label: 'קרדיט וחיוב', href: 'https://console.anthropic.com/settings/billing' }, { label: 'שימוש', href: 'https://console.anthropic.com/usage' }] },
    { key: 'invoices', icon: 'receipt', name: 'חשבוניות (מורנינג)', what: 'הפקת חשבונית מס / קבלה מתוך התיק.',
      status: morningEnabled() ? 'ok' : 'off', live: morningEnabled() ? 'מחובר' : 'לא מחובר (לא חובה)', links: [{ label: 'מורנינג', href: 'https://app.greeninvoice.co.il' }] },
    { key: 'sms', icon: 'message', name: 'הודעות לנייד (Twilio)', what: 'תזכורת SMS / וואטסאפ למטופל.',
      status: smsEnabled() ? 'ok' : 'off', live: smsEnabled() ? 'מחובר' : 'לא מחובר (לא חובה)', links: [{ label: 'Twilio', href: 'https://console.twilio.com' }] },
    { key: 'code', icon: 'file', name: 'קוד המערכת (GitHub)', what: 'הקוד של האתר, במאגר פרטי. כל שינוי נשמר שם עם היסטוריה מלאה.',
      status: 'ok', live: 'מאגר פרטי', links: [{ label: 'המאגר', href: 'https://github.com/doctorlinecoil-hub/doctor-portal' }] },
  ];
  return (
    <>
      <PageHead title="מפת המערכת" sub="כל השירותים שהאתר רץ עליהם: מה כל אחד עושה, איפה מנהלים אותו, מתי מתחדש – ובדיקה חיה שהכול עובד." crumbs={[{ href: '/admin', label: 'הגדרות' }]} />
      <SystemMap services={services} notes={(notesRow?.data as Record<string, Record<string, string>> | null) ?? {}} />
    </>
  );
}
