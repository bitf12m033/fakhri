import { cookies } from 'next/headers';
import { COOKIE } from './session/cookies';
import { readClaims } from './session/jwt';

export type AdminRole = 'SUPER_ADMIN' | 'CATALOG' | 'INVENTORY' | 'ORDERS' | 'MARKETING' | 'SUPPORT';

export const ADMIN_ROLES: AdminRole[] = ['SUPER_ADMIN', 'CATALOG', 'INVENTORY', 'ORDERS', 'MARKETING', 'SUPPORT'];

/**
 * Admin sections and the roles the API lets through (the @Roles on each
 * controller). SUPER_ADMIN passes everywhere, as in AccessGuard. This only
 * decides what the console shows; the API is what enforces it (REQ-29).
 */
export const SECTIONS = {
  orders: { label: 'Orders', href: '/admin/orders', roles: ['ORDERS'] },
  products: { label: 'Products', href: '/admin/products', roles: ['CATALOG'] },
  categories: { label: 'Categories', href: '/admin/categories', roles: ['CATALOG'] },
  brands: { label: 'Brands', href: '/admin/brands', roles: ['CATALOG'] },
  attributes: { label: 'Attributes', href: '/admin/attributes', roles: ['CATALOG'] },
  inventory: { label: 'Inventory', href: '/admin/inventory', roles: ['INVENTORY'] },
  coupons: { label: 'Coupons', href: '/admin/coupons', roles: ['MARKETING'] },
  reviews: { label: 'Reviews', href: '/admin/reviews', roles: ['MARKETING', 'SUPPORT'] },
  content: { label: 'Content', href: '/admin/content', roles: ['MARKETING'] },
  reports: { label: 'Reports', href: '/admin/reports', roles: ['ORDERS'] },
  users: { label: 'Admin users', href: '/admin/users', roles: [] },
  audit: { label: 'Audit log', href: '/admin/audit', roles: [] },
  outbox: { label: 'Outbox', href: '/admin/outbox', roles: [] },
} satisfies Record<string, { label: string; href: string; roles: AdminRole[] }>;

export type Section = keyof typeof SECTIONS;

export interface AdminPrincipal {
  id: string;
  role: AdminRole;
}

/** The signed-in admin, from the access token's claims (unverified: display only). */
export async function currentAdmin(): Promise<AdminPrincipal | null> {
  const claims = readClaims((await cookies()).get(COOKIE.adminAccess)?.value);
  if (!claims || claims.typ !== 'ADMIN' || !claims.role) return null;
  return { id: claims.sub, role: claims.role as AdminRole };
}

export function canAccess(role: AdminRole, section: Section): boolean {
  return role === 'SUPER_ADMIN' || (SECTIONS[section].roles as AdminRole[]).includes(role);
}
