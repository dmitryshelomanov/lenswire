import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

const SITE_URL = 'https://dmitryshelomanov.github.io/lenswire';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/privacy/`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.5,
    },
  ];
}
