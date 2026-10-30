import type { Metadata } from 'next';
import { landingData, physicianJsonLd } from '@/lib/landingData';
import Landing from '@/views/Landing';

export const dynamic = 'force-dynamic';
const description = 'ייעוץ, בדיקה וחוות דעת אצל נוירוכירורג בכיר. קביעת תור אונליין תוך שתי דקות, זימון ותזכורות, והמסמך החתום נשלח אליכם במייל.';
export const metadata: Metadata = {
  title: 'קביעת תור אצל ד״ר אלרן חנוך · נוירוכירורג ילדים ומבוגרים',
  description,
  robots: { index: true, follow: true },
  alternates: { canonical: '/patients' },
  openGraph: { type: 'website', locale: 'he_IL', title: 'קביעת תור אצל ד״ר אלרן חנוך · נוירוכירורג ילדים ומבוגרים', description, images: [{ url: '/brand/og.jpg', width: 1200, height: 630 }] },
  twitter: { card: 'summary_large_image', images: ['/brand/og.jpg'] },
};

/** A landing page for ads aimed at patients (same page, its own message and order). */
export default async function Page() {
  const { s, services } = await landingData();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(physicianJsonLd(s, services)).replace(/</g, '\\u003c') }} />
      <Landing s={s} services={services} audience="patients" />
    </>
  );
}
