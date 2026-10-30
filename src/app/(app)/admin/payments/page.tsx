import { redirect } from 'next/navigation';

/** Payments now live with the reports. Old links keep working. */
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  const { f, q } = await searchParams;
  redirect(`/admin/reports?tab=collect${f ? `&f=${encodeURIComponent(f)}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
}
