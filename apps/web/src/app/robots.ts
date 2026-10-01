import type { MetadataRoute } from 'next';
import { absolute } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/account', '/cart', '/checkout', '/orders', '/bff', '/internal', '/search', '/compare'],
    },
    sitemap: absolute('/sitemap.xml'),
  };
}
