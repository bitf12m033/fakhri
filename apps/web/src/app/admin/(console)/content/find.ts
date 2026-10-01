import type { AdminBanner, AdminContentPage } from '@/lib/api/admin-ops-types';
import { sessionApi } from '@/lib/api/server';
import type { PaginationMeta } from '@/lib/api/types';

/**
 * The content API has no read-one route, so an edit screen walks the list.
 * There are a handful of pages, so this is one request in practice.
 */
export async function findPage(id: string): Promise<AdminContentPage | null> {
  for (let page = 1; page <= 20; page += 1) {
    const { data, meta } = await sessionApi<AdminContentPage[], PaginationMeta>(
      `/admin/content/pages?page=${page}&pageSize=100`,
      { session: 'admin' },
    );
    const found = data.find((row) => row.id === id);
    if (found) return found;
    if (page >= meta.totalPages) break;
  }
  return null;
}

export async function findBanner(id: string): Promise<AdminBanner | null> {
  const { data } = await sessionApi<AdminBanner[]>('/admin/content/banners', { session: 'admin' });
  return data.find((row) => row.id === id) ?? null;
}
