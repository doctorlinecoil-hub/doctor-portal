import type { MetadataRoute } from 'next';
import { appUrl } from '@/lib/mail';

/** The marketing pages are open to search engines; the system itself is not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: ['/', '/lawyers', '/patients', '/book', '/register', '/accessibility', '/privacy', '/terms', '/brand/'], disallow: ['/doctor', '/admin', '/firm', '/api', '/letters', '/rx', '/pay', '/auth', '/setup', '/mfa', '/preview', '/forgot'] }],
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
