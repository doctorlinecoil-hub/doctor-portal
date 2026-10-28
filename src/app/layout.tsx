import type { Metadata, Viewport } from 'next';
import './globals.css';
import { supabaseConfig } from '@/lib/env';
import { SupabaseProvider } from '@/lib/supabase/browser';

export const metadata: Metadata = {
  title: 'מרפאת ד״ר אלרן חנוך',
  description: 'תורים, תיקים, מכתבים רפואיים ותשלומים',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'ד״ר חנוך', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#0D1B2A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { url, anonKey } = supabaseConfig();
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600&family=Rubik:wght@500;600;700&display=swap" />
      </head>
      <body>
        {url && anonKey ? (
          <SupabaseProvider url={url} anonKey={anonKey}>{children}</SupabaseProvider>
        ) : (
          <main className="auth-form">
            <div className="auth-card"><div className="panel">
              <h1>המערכת עוד לא מחוברת למאגר הנתונים</h1>
              <p className="muted">צריך לחבר את Supabase בהגדרות של Vercel ולפרוס מחדש.</p>
            </div></div>
          </main>
        )}
      </body>
    </html>
  );
}
