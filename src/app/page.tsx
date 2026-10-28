import { redirect } from 'next/navigation';
import { getSession, homeFor } from '@/lib/auth';

export default async function Home() {
  const { claims, profile } = await getSession();
  if (!claims) redirect('/login');
  if (!profile || !profile.active) redirect('/login?e=noaccess');
  redirect(homeFor(profile.role));
}
