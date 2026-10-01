/**
 * Cache tags on storefront fetches. The API's RevalidationSubscriber posts these
 * names (apps/api/src/modules/revalidation), so keep the two lists in step.
 */
export const TAGS = {
  /** Anything that lists products: home, PLPs, brand pages, category counts. */
  catalog: 'catalog',
  product: (slug: string) => `product:${slug}`,
  /** Banners and page lists. */
  content: 'content',
  page: (slug: string) => `page:${slug}`,
} as const;
