import { requireUser } from '@/lib/auth';
import { loadAppointments } from '@/lib/queries';
import { dayNum, fromDayNum, ilToUtc, todayIL } from '@/lib/dates';
import { CalendarView, monthGridStart, weekStart, type BlockRow } from '@/views/CalendarView';
import { BlockForm, FreeSlot, RemoveBlock } from './CalendarTools';

export const dynamic = 'force-dynamic';

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; d?: string }> }) {
  const sp = await searchParams;
  const { supabase, settings } = await requireUser(['doctor', 'admin']);
  const view = sp.view === 'month' ? 'month' : sp.view === 'day' ? 'day' : 'week';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.d || '') ? sp.d! : todayIL();
  const start = view === 'day' ? date : view === 'week' ? weekStart(date) : monthGridStart(date);
  const end = fromDayNum(dayNum(start) + (view === 'day' ? 1 : view === 'week' ? 7 : 42));
  const from = ilToUtc(start, '00:00').toISOString();
  const to = ilToUtc(end, '00:00').toISOString();
  const [rows, { data: blocks }] = await Promise.all([
    loadAppointments(supabase, { from, to, order: 'asc', slotsOnly: true }),
    supabase.from('time_blocks').select('id, starts_at, ends_at, note').lt('starts_at', to).gt('ends_at', from).order('starts_at'),
  ]);
  return (
    <CalendarView
      view={view}
      date={date}
      rows={rows}
      blocks={(blocks as BlockRow[] | null) ?? []}
      settings={settings}
      tools={<div className="row"><BlockForm today={todayIL()} /></div>}
      slotAction={(iso, label) => <FreeSlot iso={iso} label={label} minutes={settings.slot_minutes} />}
      blockAction={(b) => <RemoveBlock id={b.id} />}
    />
  );
}
