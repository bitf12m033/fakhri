import type { AttributeType, CategoryNode, ProductStatus, Seo } from '@/lib/api/admin-catalog-types';

/** Pure helpers shared by the catalog forms. Server- and client-safe. */

/** HTML `pattern`s matching the API DTOs, so the browser catches most mistakes first. */
export const PATTERN = {
  slug: '[a-z0-9]+(-[a-z0-9]+)*',
  money: '\\d+(\\.\\d{1,2})?',
  decimal3: '\\d+(\\.\\d{1,3})?',
  sku: '[A-Za-z0-9][A-Za-z0-9._\\-]{0,63}',
  barcode: '[A-Za-z0-9\\-]{1,32}',
};

/** Trimmed text, or null when blank: the PATCH DTOs clear a field with null. */
export function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** For create DTOs, which reject null: drop the key when blank. */
export function optional<K extends string>(key: K, value: string): Partial<Record<K, string>> {
  const trimmed = value.trim();
  return trimmed ? ({ [key]: trimmed } as Record<K, string>) : {};
}

export function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export interface SeoDraft {
  title: string;
  description: string;
  keywords: string;
}

export function seoDraft(seo: Seo | null | undefined): SeoDraft {
  return { title: seo?.title ?? '', description: seo?.description ?? '', keywords: (seo?.keywords ?? []).join(', ') };
}

/** SeoDto from the draft, or null when every field is blank. */
export function seoPayload(draft: SeoDraft): Seo | null {
  const seo: Seo = {};
  if (draft.title.trim()) seo.title = draft.title.trim();
  if (draft.description.trim()) seo.description = draft.description.trim();
  const keywords = splitList(draft.keywords);
  if (keywords.length > 0) seo.keywords = keywords;
  return Object.keys(seo).length > 0 ? seo : null;
}

export interface FlatCategory {
  id: string;
  name: string;
  depth: number;
  isActive: boolean;
}

/** Depth-first flattening for <select>s; `exclude` drops a node and its whole subtree. */
export function flattenTree(nodes: CategoryNode[], exclude?: string, depth = 0): FlatCategory[] {
  return nodes.flatMap((node) =>
    node.id === exclude
      ? []
      : [
          { id: node.id, name: node.name, depth, isActive: node.isActive },
          ...flattenTree(node.children, exclude, depth + 1),
        ],
  );
}

export function indentLabel(category: FlatCategory): string {
  return `${'— '.repeat(category.depth)}${category.name}${category.isActive ? '' : ' (inactive)'}`;
}

export const TYPE_LABEL: Record<AttributeType, string> = {
  TEXT: 'Text',
  NUMBER: 'Number',
  BOOLEAN: 'Yes / no',
  OPTION: 'Choice from options',
  JSON: 'Structured (JSON)',
};

export const STATUS_LABEL: Record<ProductStatus, string> = {
  DRAFT: 'Draft (hidden)',
  ACTIVE: 'Active (on sale)',
  ARCHIVED: 'Archived (hidden)',
};
