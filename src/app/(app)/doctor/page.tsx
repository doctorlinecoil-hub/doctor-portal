import { requireUser } from '@/lib/auth';
import { released } from '@/lib/types';
import { loadAppointments } from '@/lib/queries';
import type { IntakeData } from '@/lib/intakeTypes';
import { DoctorAgendaView, type IntakeChip } from '@/views/DoctorViews';
import ApprovalButtons, { type DepositState } from './ApprovalButtons';
import ShareLink from '@/components/ShareLink';
import { SetupStatus, type SetupItem } from '@/views/SetupStatus';
import { mailEnabled } from '@/lib/mail';
import { isAuthError } from '@/lib/aiErrors';
import RescheduleDecision, { type RescheduleRow } from './RescheduleDecision';
import { DAYS, dayNum, fmtDate, fromDayNum, ilParts, ilToUtc, todayIL, weekday } from '@/lib/dates';
import { CalendarView, monthGridStart, weekStart, type BlockRow } from '@/views/CalendarView';
import { BlockForm, FreeSlot, RemoveBlock } from './calendar/CalendarTools';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ view?: string; d?: string }> }) {
  const { view, d } = await searchParams;
  // the dashboard and the calendar are one page: day / week / month grid, or the list
  const mode = view === 'day' || view === 'month' || view === 'list' || view === 'past' ? view : 'week';
  const { supabase, profile, settings } = await requireUser(['doctor', 'admin']);
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
    const [{ data: cronOn }, { count: pricedServices }] = await Promise.all([
      supabase.rpc('cron_active'),
      supabase.from('services').select('id', { count: 'exact', head: true }).eq('active', true).gt('price', 0),
    ]);
    setupItems = [
      { key: 'ai', ok: !keyBad, title: 'מפתח ה־AI לא עובד', why: 'בלי מפתח תקין אין סריקת תיקים ואין ניסוח מכתבים אוטומטי (אפשר לכתוב ידנית).',
        how: ['ב־console.anthropic.com: API Keys ← Create Key, ולהעתיק את כל המפתח (מתחיל ב־sk-ant-)', `${vercel}: לערוך את ANTHROPIC_API_KEY ולהדביק בלי רווחים`, 'Deployments ← ⋯ ← Redeploy', 'בתיק: ״סריקה מחדש״'] },
      { key: 'mail', ok: mailEnabled(), title: 'שליחת מיילים לא מוגדרת', why: 'זימונים, תזכורות והמכתב הסופי לא נשלחים במייל. בינתיים אפשר לשלוח בוואטסאפ מתוך התיק.',
        how: ['להירשם בחינם ב־resend.com ולאמת את הדומיין של המרפאה (Domains)', 'API Keys ← Create, ולהעתיק', `${vercel}: RESEND_API_KEY = המפתח, MAIL_FROM = מרפאת ד״ר אלרן חנוך <clinic@הדומיין-שלכם>`, 'Redeploy'] },
      { key: 'prices', ok: (pricedServices ?? 0) > 0 || Object.values(settings.prices || {}).some((v) => Number(v) > 0), title: 'לא הוגדרו מחירים', why: 'כל התיקים מסומנים ״ללא חיוב״, והדוחות והגבייה ריקים.',
        how: ['בתפריט: סוגי שירות ומחירים ← מחיר לכל שירות (כולל מע״מ)', 'שמירה'] },
      { key: 'cron', ok: !!process.env.CRON_SECRET || cronOn === true, title: 'תזכורות אוטומטיות לא פעילות', why: 'תזכורות 3 ימים ושעתיים לפני התור לא נשלחות.',
        how: ['Vercel ← Deployments ← ⋯ ← Redeploy (ההתקנה נעשית אוטומטית בבנייה)', `אם עדיין לא פעיל: ${vercel}: CRON_SECRET = טקסט אקראי ארוך`] },
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
  let calendar: React.ReactNode = null;
  if (mode === 'day' || mode === 'week' || mode === 'month') {
    // on Friday/Saturday the default week is the coming one
    const date = /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d! : mode === 'week' && weekday(todayIL()) >= 5 ? fromDayNum(dayNum(todayIL()) + 2) : todayIL();
    const cs = mode === 'day' ? date : mode === 'week' ? weekStart(date) : monthGridStart(date);
    const ce = fromDayNum(dayNum(cs) + (mode === 'day' ? 1 : mode === 'week' ? 7 : 42));
    const from = ilToUtc(cs, '00:00').toISOString();
    const to = ilToUtc(ce, '00:00').toISOString();
    const [calRows, { data: blocks }] = await Promise.all([
      loadAppointments(supabase, { from, to, order: 'asc', slotsOnly: true }),
      supabase.from('time_blocks').select('id, starts_at, ends_at, note').lt('starts_at', to).gt('ends_at', from).order('starts_at'),
    ]);
    calendar = (
      <CalendarView embedded base="/doctor" view={mode} date={date} rows={calRows} blocks={(blocks as BlockRow[] | null) ?? []} settings={settings}
        tools={<BlockForm today={todayIL()} />}
        slotAction={(iso, lbl) => <FreeSlot iso={iso} label={lbl} minutes={settings.slot_minutes} />}
        blockAction={(b) => <RemoveBlock id={b.id} />} />
    );
  }
  const { data: depRows } = await supabase.from('appointments').select('id, deposit_amount, deposit_paid_at, deposit_proof_at').eq('status', 'pending').gt('deposit_amount', 0);
  const deposits: Record<string, DepositState> = Object.fromEntries((depRows ?? []).map((d) => [d.id, { amount: Number(d.deposit_amount), paid: !!d.deposit_paid_at, proof: !!d.deposit_proof_at }]));
  return (
    <DoctorAgendaView
      share={<ShareLink path="/book" compact title="קישור לקביעת תור למפנים ולמטופלים" />}
      rows={rows}
      past={mode === 'past'}
      mode={mode}
      calendar={calendar}
      awaitingPay={rows.filter((r) => r.status === 'done' && !released(r, settings.letter_requires_payment !== false)).length}
      isAdmin={profile.role === 'admin'}
      name={profile.full_name || ''}
      intake={chips}
      openRequests={openRequests ?? 0}
      approvals={(id) => <ApprovalButtons id={id} compact deposit={deposits[id] ?? null} />}
      reschedules={reschedules}
      setup={<SetupStatus items={setupItems} />}
    />
  );
}
