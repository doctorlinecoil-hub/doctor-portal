import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession, homeFor } from '@/lib/auth';
import { landingData, physicianJsonLd, SITE_DESC } from '@/lib/landingData';
import Landing from '@/views/Landing';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'ד״ר אלרן חנוך · נוירוכירורג · חוות דעת רפואיות',
  description: SITE_DESC,
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
  openGraph: { type: 'website', locale: 'he_IL', title: 'ד״ר אלרן חנוך · נוירוכירורג ילדים ומבוגרים', description: SITE_DESC, images: [{ url: '/brand/og.jpg', width: 1200, height: 630 }] },
  twitter: { card: 'summary_large_image', images: ['/brand/og.jpg'] },
};

/** Signed-in users go to their home; everyone else sees the clinic's page. */
export default async function Home({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const { claims, profile } = await getSession();
  const signedIn = !!(claims && profile?.active);
  // signed-in users go to their home, unless they asked to see the public page
  if (signedIn && view !== 'public') redirect(homeFor(profile!.role));
  const { s, services } = await landingData();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(physicianJsonLd(s, services)).replace(/</g, '\\u003c') }} />
      <Landing s={s} services={services} />
    </>
  );
}
