/** RBAC arrives in increment 3.4. Until then, admin writes are audited without an actor id. */
export const CATALOG_ACTOR = { actorType: 'ADMIN' as const };

export const CATALOG_LIMITS = {
  treeDepth: 32,
  bindingsPerCategory: 80,
  valuesPerScope: 80,
  variantsPerProduct: 100,
  imagesPerProduct: 40,
} as const;

export const PRODUCT_PUBLISHED = 'PRODUCT_PUBLISHED';
