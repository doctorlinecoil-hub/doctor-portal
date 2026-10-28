import type { MetadataRoute } from 'next';

// Lets the portal be installed on the phone's home screen (iPhone: Share → Add to Home Screen; Android: Install app).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'מרפאת ד״ר אלרן חנוך',
    short_name: 'ד״ר חנוך',
    description: 'תורים, תיקים ומכתבים רפואיים',
    start_url: '/',
    display: 'standalone',
    dir: 'rtl',
    lang: 'he',
    background_color: '#0D1B2A',
    theme_color: '#0D1B2A',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
