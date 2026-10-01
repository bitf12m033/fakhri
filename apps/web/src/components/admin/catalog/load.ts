import type { AdminAttributeRow, AdminBrand, CategoryNode } from '@/lib/api/admin-catalog-types';
import { sessionApi } from '@/lib/api/server';
import type { PaginationMeta } from '@/lib/api/types';

/** Server-side loaders for the reference lists the catalog forms pick from. */

const PAGE = 100; // the API's MAX_PAGE_SIZE

/** Every row of a paginated admin list, for pickers (brands and attributes stay in the low hundreds). */
async function all<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; ; page++) {
    const separator = path.includes('?') ? '&' : '?';
    const { data, meta } = await sessionApi<T[], PaginationMeta>(`${path}${separator}page=${page}&pageSize=${PAGE}`, {
      session: 'admin',
    });
    rows.push(...data);
    if (page >= meta.totalPages) return rows;
  }
}

export function allBrands(): Promise<AdminBrand[]> {
  return all<AdminBrand>('/admin/brands');
}

export function allAttributes(): Promise<AdminAttributeRow[]> {
  return all<AdminAttributeRow>('/admin/attributes');
}

export async function categoryTree(): Promise<CategoryNode[]> {
  return (await sessionApi<CategoryNode[]>('/admin/categories/tree', { session: 'admin' })).data;
}
