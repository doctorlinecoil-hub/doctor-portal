import { requireUser } from '@/lib/auth';
import { loadAppointments } from '@/lib/queries';
import type { IntakeData } from '@/lib/intakeTypes';
import { DoctorAgendaView, type IntakeChip } from '@/views/DoctorViews';
import ApprovalButtons from './ApprovalButtons';
import { SetupStatus, type SetupItem } from '@/views/SetupStatus';
import { mailEnabled } from '@/lib/mail';
import { isAuthError } from '@/lib/aiErrors';
import RescheduleDecision, { type RescheduleRow } from './RescheduleDecision';
import { DAYS, fmtDate, ilParts, ilToUtc, todayIL, weekday } from '@/lib/dates';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const { supabase, profile } = await requireUser(['doctor', 'admin']);
  const start = ilToUtc(todayIL(), '00:00').getTime();
  const rows = await loadAppointments(supabase, { from: new Date(start - 365 * 86400000).toISOString(), order: 'asc', limit: 2000 });

  // AI scan results for the cases on screen (upcoming and pending)
  const ids = rows.filter((r) => r.status !== 'cancelled' && new Date(r.starts_at).getTime() >= start - 14 * 86400000).map((r) => r.id).slice(0, 300);
  const [{ data: intake }, { count: openRequests }, { data: rq }] = await Promise.all([
    ids.length ? supabase.from('case_intake').select('appointment_id, status, data').in('appointment_id', ids) : Promise.resolve({ data: [] }),
    supabase.from('case_notes').select('id', { count: 'exact', head: true }).eq('kind', 'request').is('resolved_at', null),
    supabase.from('reschedule_requests').select('id, appointment_id, requested_starts_at, reason, created_at').eq('status', 'pending').order('created_at').limit(20),
  ]);
  const label = (iso: string) => { const p = ilParts(iso); return `יום ${DAYS[weekday(p.date)]} ${fmtDate(p.date)} ${p.time}`; };
  const byId = new Map(rows.map((r) => [r.id, r]));
  const reschedules = ((rq as RescheduleRow[] | null) ?? []).filter((r) => byId.has(r.appointment_id)).map((r) => {
    const a = byId.get(r.appointment_id)!;
    return <RescheduleDecision key={r.id} req={r} compact fromLabel={`${a.patient_name} · ${label(a.starts_at)}`} toLabel={label(r.requested_starts_at)} />;
  });
  // admin only: what is still missing in the server settings
  let setupItems: SetupItem[] = [];
  if (profile.role === 'admin') {
    const { data: lastErr } = await supabase.from('case_intake').select('error').eq('status', 'error').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    const { data: lastOk } = await supabase.from('case_intake').select('updated_at').eq('status', 'done').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    const keyBad = !process.env.ANTHROPIC_API_KEY || (!!lastErr && isAuthError(lastErr.error) && !lastOk);
    const vercel = 'ב־Vercel: Settings ← Environment Variables';
    setupItems = [
      { key: 'ai', ok: !keyBad, title: 'מפתח ה־AI לא עובד', why: 'בלי מפתח תקין אין סריקת תיקים ואין ניסוח מכתבים אוטומטי (אפשר לכתוב ידנית).',
        how: ['ב־console.anthropic.com: API Keys ← Create Key, ולהעתיק את כל המפתח (מתחיל ב־sk-ant-)', `${vercel}: לערוך את ANTHROPIC_API_KEY ולהדביק בלי רווחים`, 'Deployments ← ⋯ ← Redeploy', 'בתיק: ״סריקה מחדש״'] },
      { key: 'mail', ok: mailEnabled(), title: 'שליחת מיילים לא מוגדרת', why: 'זימונים, תזכורות והמכתב הסופי לא נשלחים במייל. בינתיים אפשר לשלוח בוואטסאפ מתוך התיק.',
        how: ['להירשם בחינם ב־resend.com ולאמת את הדומיין של המרפאה (Domains)', 'API Keys ← Create, ולהעתיק', `${vercel}: RESEND_API_KEY = המפתח, MAIL_FROM = מרפאת ד״ר אלרן חנוך <clinic@הדומיין-שלכם>`, 'Redeploy'] },
      { key: 'cron', ok: !!process.env.CRON_SECRET, title: 'תזכורות אוטומטיות לא פעילות', why: 'תזכורת יום לפני התור לא נשלחת.',
        how: [`${vercel}: CRON_SECRET = טקסט אקראי ארוך כלשהו`, 'Redeploy'] },
    ];
  }
  const chips: Record<string, IntakeChip> = {};
  for (const i of (intake as { appointment_id: string; status: string; data: IntakeData | null }[] | null) ?? []) {
    chips[i.appointment_id] = {
      status: i.status,
      readiness: i.data?.readiness ?? 0,
      flags: (i.data?.red_flags?.filter((f) => f.level === 'high').length ?? 0) + (i.data?.patient_check?.length ?? 0),
      missing: i.data?.missing?.length ?? 0,
    };
  }
  return (
    <DoctorAgendaView
      rows={rows}
      past={view === 'past'}
      isAdmin={profile.role === 'admin'}
      name={profile.full_name || ''}
      intake={chips}
      openRequests={openRequests ?? 0}
      approvals={(id) => <ApprovalButtons id={id} compact />}
      reschedules={reschedules}
      setup={<SetupStatus items={setupItems} />}
    />
  );
}
