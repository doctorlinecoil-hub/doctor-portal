import { redirect } from 'next/navigation';

/** The calendar now lives on the dashboard. Old links keep working. */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; d?: string }> }) {
  const sp = await searchParams;
  const view = sp.view === 'month' ? 'month' : sp.view === 'day' ? 'day' : 'week';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(sp.d || '') ? `&d=${sp.d}` : '';
  redirect(`/doctor?view=${view}${d}#cal`);
}
