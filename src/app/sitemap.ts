import type { MetadataRoute } from 'next';
import { appUrl } from '@/lib/mail';

export default function sitemap(): MetadataRoute.Sitemap {
  const u = appUrl();
  const now = new Date();
  return [
    { url: `${u}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${u}/lawyers`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${u}/patients`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${u}/book`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${u}/register`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${u}/accessibility`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${u}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${u}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ];
}
