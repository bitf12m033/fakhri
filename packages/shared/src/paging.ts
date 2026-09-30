export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

/** Sanitize & clamp pagination input (REQ-38: every list is paginated). */
export function normalizePagination(options: PaginationOptions = {}): {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
} {
  const page = normalizePage(options.page);
  const pageSize = normalizePageSize(options.pageSize);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function normalizePage(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value) || value < 1) return DEFAULT_PAGE;
  return Math.floor(value);
}

export function normalizePageSize(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value) || value < 1) return DEFAULT_PAGE_SIZE;
  const size = Math.floor(value);
  return Math.min(size, MAX_PAGE_SIZE);
}

export function buildMeta(count: number, skip: number, take: number): PaginationMeta {
  const page = skip <= 0 ? 1 : Math.floor(skip / take) + 1;
  const totalPages = Math.max(1, Math.ceil(count / take));
  return { page, pageSize: take, totalItems: count, totalPages };
}

export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

export function paginate<T>(all: T[], options: PaginationOptions = {}): PaginatedResult<T> {
  const { skip, take } = normalizePagination(options);
  const items = all.slice(skip, skip + take);
  return { items, meta: buildMeta(all.length, skip, take) };
}