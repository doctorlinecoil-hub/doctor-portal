import type { Metadata } from 'next';
import { landingData, physicianJsonLd } from '@/lib/landingData';
import Landing from '@/views/Landing';

export const dynamic = 'force-dynamic';
const description = 'חוות דעת רפואיות מנומקות מנוירוכירורג בכיר, לבית משפט ולביטוח הלאומי. קביעת תור לכל לקוח בלחיצה, ומסמך חתום ומוכן להגשה במייל.';
export const metadata: Metadata = {
  title: 'חוות דעת רפואיות לעורכי דין · ד״ר אלרן חנוך, נוירוכירורג',
  description,
  robots: { index: true, follow: true },
  alternates: { canonical: '/lawyers' },
  openGraph: { type: 'website', locale: 'he_IL', title: 'חוות דעת רפואיות לעורכי דין · ד״ר אלרן חנוך, נוירוכירורג', description, images: [{ url: '/brand/og.jpg', width: 1200, height: 630 }] },
  twitter: { card: 'summary_large_image', images: ['/brand/og.jpg'] },
};

/** A landing page for ads aimed at lawyers (same page, its own message and order). */
export default async function Page() {
  const { s, services } = await landingData();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(physicianJsonLd(s, services)).replace(/</g, '\\u003c') }} />
      <Landing s={s} services={services} audience="lawyers" />
    </>
  );
}
