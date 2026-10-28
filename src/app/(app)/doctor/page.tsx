import { requireUser } from '@/lib/auth';
import { loadAppointments } from '@/lib/queries';
import type { IntakeData } from '@/lib/intakeTypes';
import { DoctorAgendaView, type IntakeChip } from '@/views/DoctorViews';
import ApprovalButtons from './ApprovalButtons';
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
    />
  );
}
