import { Injectable } from '@nestjs/common';
import { Attribute, AttributeType, Prisma, ProductStatus } from '@fakhri/prisma';
import { buildMeta, invalidInput, normalizePagination, notFound } from '@fakhri/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesService, TemplateBinding } from '../catalog/categories/categories.service';
import { StorefrontService } from '../catalog/public/storefront.service';
import { AttributeFilter, Range, SEARCH_LIMITS, SortKey } from './search-query';

export interface SearchRequest {
  term?: string;
  categorySlug?: string;
  brandSlugs: string[];
  attributes: AttributeFilter[];
  price?: Range;
  sort: SortKey;
  page?: number;
  pageSize?: number;
}

export interface FacetValue {
  value: string;
  label: string;
  count: number;
}

export interface AttributeFacet {
  slug: string;
  name: string;
  type: AttributeType;
  unit: string | null;
  values: FacetValue[];
  range: { min: string; max: string } | null;
}

/** An attribute filter paired with the attribute row it names. */
interface ResolvedFilter {
  filter: AttributeFilter;
  attribute: Attribute;
  optionIds: string[];
}

type CountRow = { count: number };

/**
 * Public product search and faceting over Postgres (REQ-04/09, increment 3.3).
 *
 * Matching is threefold: tsvector for ranked full-text, ILIKE over the trigram
 * index for substrings, and word_similarity for typos. Facet counts use
 * drop-self semantics for brand and attribute facets (a facet does not count
 * itself, so multi-select stays additive) while the category facet keeps the
 * current selection, because it refines navigation rather than widening it.
 */
@Injectable()
export class ProductSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
    private readonly storefront: StorefrontService,
  ) {}

  async search(request: SearchRequest) {
    const { skip, take } = normalizePagination(request);
    const scope = await this.resolveCategory(request.categorySlug);
    const resolved = await this.resolveAttributes(request.attributes);

    const where = this.where(request, scope, resolved);
    const [counted] = await this.prisma.$queryRaw<CountRow[]>(
      Prisma.sql`SELECT count(*)::int AS count ${this.from()} WHERE ${where}`,
    );
    const total = counted?.count ?? 0;

    const ids =
      total === 0
        ? []
        : (
            await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
              SELECT p.id ${this.from()} WHERE ${where}
              ORDER BY ${this.order(request)}
              LIMIT ${take} OFFSET ${skip}
            `)
          ).map((row) => row.id);

    const [items, facets] = await Promise.all([
      this.storefront.cards(ids),
      this.facets(request, scope, resolved),
    ]);
    return { items, meta: { ...buildMeta(total, skip, take), sort: request.sort, facets } };
  }

  /** Autocomplete over products, brands and categories (REQ-09). */
  async suggest(term: string) {
    const like = likePattern(term);
    const products = await this.prisma.$queryRaw<{ slug: string; name: string; brand: string }[]>(Prisma.sql`
      SELECT p.slug, p.name, b.name AS brand
        ${this.from()}
       WHERE ${this.visible()}
         AND (${term} <% p.name OR p.name ILIKE ${like} OR p."searchVector" @@ plainto_tsquery('simple', ${term}))
       ORDER BY word_similarity(${term}, p.name) DESC, p."isFeatured" DESC, p.name ASC
       LIMIT ${SEARCH_LIMITS.suggestions}
    `);
    const [brands, categories] = await Promise.all([
      this.prisma.brand.findMany({
        where: { isActive: true, name: { contains: term, mode: 'insensitive' } },
        select: { slug: true, name: true },
        orderBy: { name: 'asc' },
        take: 5,
      }),
      this.prisma.category.findMany({
        where: { isActive: true, name: { contains: term, mode: 'insensitive' } },
        select: { slug: true, name: true },
        orderBy: { name: 'asc' },
        take: 5,
      }),
    ]);
    return { products, brands, categories };
  }

  // ------------------------------------------------------------------ SQL pieces

  private from(): Prisma.Sql {
    return Prisma.sql`
      FROM "Product" p
      JOIN "Brand" b ON b.id = p."brandId"
      JOIN "Category" c ON c.id = p."categoryId"
      LEFT JOIN LATERAL (
        SELECT min(v.price) AS "fromPrice", max(v.price) AS "toPrice"
          FROM "ProductVariant" v
         WHERE v."productId" = p.id AND v."isActive"
      ) pr ON TRUE
    `;
  }

  /** Public visibility: active product, active brand and category, one active variant. */
  private visible(): Prisma.Sql {
    return Prisma.sql`p.status = ${ProductStatus.ACTIVE}::"ProductStatus"
      AND b."isActive" AND c."isActive" AND pr."fromPrice" IS NOT NULL`;
  }

  /**
   * Full predicate. `omit` drops one facet's own filter so it can count itself
   * (`brand`, `price`, or an attribute id).
   */
  private where(
    request: SearchRequest,
    scope: { id: string; subtreeIds: string[] } | undefined,
    resolved: ResolvedFilter[],
    omit?: 'brand' | 'price' | string,
  ): Prisma.Sql {
    const parts: Prisma.Sql[] = [this.visible()];

    if (request.term) {
      const like = likePattern(request.term);
      parts.push(Prisma.sql`(
        p."searchVector" @@ plainto_tsquery('simple', ${request.term})
        OR p."searchDocument" ILIKE ${like}
        OR ${request.term} <% coalesce(p."searchDocument", p.name)
      )`);
    }
    if (scope) parts.push(Prisma.sql`p."categoryId" IN (${Prisma.join(scope.subtreeIds)})`);
    if (request.brandSlugs.length > 0 && omit !== 'brand') {
      parts.push(Prisma.sql`b.slug IN (${Prisma.join(request.brandSlugs)})`);
    }
    if (request.price && omit !== 'price') {
      parts.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "ProductVariant" v
         WHERE v."productId" = p.id AND v."isActive"
           ${request.price.min ? Prisma.sql`AND v.price >= ${request.price.min}::numeric` : Prisma.empty}
           ${request.price.max ? Prisma.sql`AND v.price <= ${request.price.max}::numeric` : Prisma.empty}
      )`);
    }
    for (const entry of resolved) {
      if (entry.attribute.id === omit) continue;
      parts.push(Prisma.sql`EXISTS (
        SELECT 1
          FROM "ProductAttributeValue" pav
          LEFT JOIN "ProductVariant" pv ON pv.id = pav."variantId"
         WHERE pav."attributeId" = ${entry.attribute.id}
           AND (pav."productId" = p.id OR pv."productId" = p.id)
           AND ${valuePredicate(entry)}
      )`);
    }
    return Prisma.join(parts, ' AND ');
  }

  private order(request: SearchRequest): Prisma.Sql {
    switch (request.sort) {
      case 'relevance':
        return Prisma.sql`
          ts_rank(p."searchVector", plainto_tsquery('simple', ${request.term ?? ''})) DESC,
          word_similarity(${request.term ?? ''}, coalesce(p."searchDocument", p.name)) DESC,
          p."isFeatured" DESC, p."publishedAt" DESC NULLS LAST, p.id ASC`;
      case 'price_asc':
        return Prisma.sql`pr."fromPrice" ASC, p.id ASC`;
      case 'price_desc':
        return Prisma.sql`pr."fromPrice" DESC, p.id ASC`;
      case 'name_asc':
        return Prisma.sql`p.name ASC, p.id ASC`;
      case 'newest':
      default:
        return Prisma.sql`p."publishedAt" DESC NULLS LAST, p."createdAt" DESC, p.id ASC`;
    }
  }

  // ------------------------------------------------------------------ resolution

  private async resolveCategory(slug: string | undefined) {
    if (!slug) return undefined;
    const category = await this.prisma.category.findFirst({ where: { slug, isActive: true }, select: { id: true } });
    if (!category) throw notFound('Category');
    return { id: category.id, subtreeIds: await this.categories.subtreeIds(category.id) };
  }

  private async resolveAttributes(filters: AttributeFilter[]): Promise<ResolvedFilter[]> {
    if (filters.length === 0) return [];
    const attributes = await this.prisma.attribute.findMany({
      where: { slug: { in: filters.map((filter) => filter.slug) } },
      include: { options: { select: { id: true, value: true } } },
    });
    const bySlug = new Map(attributes.map((attribute) => [attribute.slug, attribute]));
    const unknown = filters.filter((filter) => !bySlug.has(filter.slug)).map((filter) => filter.slug);
    if (unknown.length > 0) throw invalidInput('Unknown attribute filter', { slugs: unknown });

    return filters.map((filter) => {
      const attribute = bySlug.get(filter.slug)!;
      if (attribute.type === AttributeType.JSON) {
        throw invalidInput('Attribute cannot be filtered', { slug: filter.slug });
      }
      if (filter.range && attribute.type !== AttributeType.NUMBER) {
        throw invalidInput('Only numeric attributes accept a range filter', { slug: filter.slug });
      }
      if (attribute.type === AttributeType.BOOLEAN && !filter.values.every(isBooleanLiteral)) {
        throw invalidInput('Boolean attribute filter must be true or false', { slug: filter.slug });
      }
      let optionIds: string[] = [];
      if (attribute.type === AttributeType.OPTION) {
        const byValue = new Map(attribute.options.map((option) => [option.value, option.id]));
        const missing = filter.values.filter((value) => !byValue.has(value));
        if (missing.length > 0) {
          throw invalidInput('Unknown option value', { slug: filter.slug, values: missing });
        }
        optionIds = filter.values.map((value) => byValue.get(value)!);
      }
      return { filter, attribute, optionIds };
    });
  }

  // ------------------------------------------------------------------ facets

  private async facets(
    request: SearchRequest,
    scope: { id: string; subtreeIds: string[] } | undefined,
    resolved: ResolvedFilter[],
  ) {
    const [brands, categories, price, attributes] = await Promise.all([
      this.brandFacet(request, scope, resolved),
      this.categoryFacet(request, scope, resolved),
      this.priceFacet(request, scope, resolved),
      this.attributeFacets(request, scope, resolved),
    ]);
    return { brands, categories, price, attributes };
  }

  private async brandFacet(
    request: SearchRequest,
    scope: { id: string; subtreeIds: string[] } | undefined,
    resolved: ResolvedFilter[],
  ): Promise<FacetValue[]> {
    return this.prisma.$queryRaw<FacetValue[]>(Prisma.sql`
      SELECT b.slug AS value, b.name AS label, count(*)::int AS count
        ${this.from()}
       WHERE ${this.where(request, scope, resolved, 'brand')}
       GROUP BY b.slug, b.name
       ORDER BY count DESC, b.name ASC
       LIMIT ${SEARCH_LIMITS.facetValues}
    `);
  }

  private async categoryFacet(
    request: SearchRequest,
    scope: { id: string; subtreeIds: string[] } | undefined,
    resolved: ResolvedFilter[],
  ): Promise<FacetValue[]> {
    return this.prisma.$queryRaw<FacetValue[]>(Prisma.sql`
      SELECT c.slug AS value, c.name AS label, count(*)::int AS count
        ${this.from()}
       WHERE ${this.where(request, scope, resolved)}
       GROUP BY c.slug, c.name
       ORDER BY count DESC, c.name ASC
       LIMIT ${SEARCH_LIMITS.facetCategories}
    `);
  }

  private async priceFacet(
    request: SearchRequest,
    scope: { id: string; subtreeIds: string[] } | undefined,
    resolved: ResolvedFilter[],
  ): Promise<{ min: string; max: string } | null> {
    const [row] = await this.prisma.$queryRaw<{ min: string | null; max: string | null }[]>(Prisma.sql`
      SELECT min(pr."fromPrice")::text AS min, max(pr."toPrice")::text AS max
        ${this.from()}
       WHERE ${this.where(request, scope, resolved, 'price')}
    `);
    return row?.min && row.max ? { min: row.min, max: row.max } : null;
  }

  /**
   * The filter panel is the filterable part of the category attribute template
   * (REQ-04). Without a category selection it is the union of the templates of
   * the categories the result set actually spans, bounded by facetCategories.
   */
  private async attributeFacets(
    request: SearchRequest,
    scope: { id: string; subtreeIds: string[] } | undefined,
    resolved: ResolvedFilter[],
  ): Promise<AttributeFacet[]> {
    const bindings = await this.filterableBindings(request, scope, resolved);
    if (bindings.length === 0) return [];

    const active = new Set(resolved.map((entry) => entry.attribute.id));
    const passive = bindings.filter((binding) => !active.has(binding.attributeId));
    const groups: { bindings: TemplateBinding[]; where: Prisma.Sql }[] = [];
    if (passive.length > 0) {
      groups.push({ bindings: passive, where: this.where(request, scope, resolved) });
    }
    for (const binding of bindings.filter((entry) => active.has(entry.attributeId))) {
      groups.push({
        bindings: [binding],
        where: this.where(request, scope, resolved, binding.attributeId),
      });
    }

    const facets = new Map<string, AttributeFacet>();
    for (const binding of bindings) {
      facets.set(binding.attributeId, {
        slug: binding.attribute.slug,
        name: binding.attribute.name,
        type: binding.attribute.type,
        unit: binding.attribute.unit,
        values: [],
        range: null,
      });
    }

    for (const group of groups) {
      const byType = (type: AttributeType) =>
        group.bindings.filter((binding) => binding.attribute.type === type).map((binding) => binding.attributeId);
      const [options, numbers, booleans, texts] = await Promise.all([
        this.optionCounts(byType(AttributeType.OPTION), group.where),
        this.numberRanges(byType(AttributeType.NUMBER), group.where),
        this.booleanCounts(byType(AttributeType.BOOLEAN), group.where),
        this.textCounts(byType(AttributeType.TEXT), group.where),
      ]);
      for (const row of [...options, ...texts, ...booleans]) {
        const facet = facets.get(row.attributeId);
        if (facet && facet.values.length < SEARCH_LIMITS.facetValues) {
          facet.values.push({ value: row.value, label: row.label, count: row.count });
        }
      }
      for (const row of numbers) {
        const facet = facets.get(row.attributeId);
        if (facet && row.min !== null && row.max !== null) facet.range = { min: row.min, max: row.max };
      }
    }

    return [...facets.values()].filter((facet) => facet.values.length > 0 || facet.range !== null);
  }

  private async filterableBindings(
    request: SearchRequest,
    scope: { id: string; subtreeIds: string[] } | undefined,
    resolved: ResolvedFilter[],
  ): Promise<TemplateBinding[]> {
    const categoryIds = scope
      ? [scope.id]
      : (
          await this.prisma.$queryRaw<{ categoryId: string }[]>(Prisma.sql`
            SELECT DISTINCT p."categoryId" AS "categoryId"
              ${this.from()}
             WHERE ${this.where(request, scope, resolved)}
             LIMIT ${SEARCH_LIMITS.facetCategories}
          `)
        ).map((row) => row.categoryId);

    const templates = await Promise.all(categoryIds.map((id) => this.categories.effectiveTemplate(id)));
    const merged = new Map<string, TemplateBinding>();
    for (const template of templates) {
      for (const binding of template) {
        if (binding.isFilterable && !merged.has(binding.attributeId)) merged.set(binding.attributeId, binding);
      }
    }
    return [...merged.values()].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.attribute.name.localeCompare(b.attribute.name),
    );
  }

  private valueJoin(attributeIds: string[]): Prisma.Sql {
    return Prisma.sql`
      JOIN LATERAL (
        SELECT pav."attributeId", pav."optionValueId", pav."numberValue", pav."booleanValue", pav."textValue"
          FROM "ProductAttributeValue" pav
          LEFT JOIN "ProductVariant" pv ON pv.id = pav."variantId"
         WHERE pav."attributeId" IN (${Prisma.join(attributeIds)})
           AND (pav."productId" = p.id OR pv."productId" = p.id)
      ) pav ON TRUE
    `;
  }

  private async optionCounts(attributeIds: string[], where: Prisma.Sql) {
    if (attributeIds.length === 0) return [];
    return this.prisma.$queryRaw<(FacetValue & { attributeId: string })[]>(Prisma.sql`
      SELECT pav."attributeId" AS "attributeId", o.value AS value, o.label AS label,
             count(DISTINCT p.id)::int AS count
        ${this.from()}
        ${this.valueJoin(attributeIds)}
        JOIN "AttributeOption" o ON o.id = pav."optionValueId"
       WHERE ${where}
       GROUP BY pav."attributeId", o.value, o.label
       ORDER BY count DESC, o.label ASC
    `);
  }

  private async textCounts(attributeIds: string[], where: Prisma.Sql) {
    if (attributeIds.length === 0) return [];
    return this.prisma.$queryRaw<(FacetValue & { attributeId: string })[]>(Prisma.sql`
      SELECT pav."attributeId" AS "attributeId", pav."textValue" AS value, pav."textValue" AS label,
             count(DISTINCT p.id)::int AS count
        ${this.from()}
        ${this.valueJoin(attributeIds)}
       WHERE ${where} AND pav."textValue" IS NOT NULL
       GROUP BY pav."attributeId", pav."textValue"
       ORDER BY count DESC, value ASC
    `);
  }

  private async booleanCounts(attributeIds: string[], where: Prisma.Sql) {
    if (attributeIds.length === 0) return [];
    return this.prisma.$queryRaw<(FacetValue & { attributeId: string })[]>(Prisma.sql`
      SELECT pav."attributeId" AS "attributeId", pav."booleanValue"::text AS value,
             CASE WHEN pav."booleanValue" THEN 'Yes' ELSE 'No' END AS label,
             count(DISTINCT p.id)::int AS count
        ${this.from()}
        ${this.valueJoin(attributeIds)}
       WHERE ${where} AND pav."booleanValue" IS NOT NULL
       GROUP BY pav."attributeId", pav."booleanValue"
       ORDER BY value ASC
    `);
  }

  private async numberRanges(attributeIds: string[], where: Prisma.Sql) {
    if (attributeIds.length === 0) return [];
    return this.prisma.$queryRaw<{ attributeId: string; min: string | null; max: string | null }[]>(Prisma.sql`
      SELECT pav."attributeId" AS "attributeId",
             trim_scale(min(pav."numberValue"))::text AS min,
             trim_scale(max(pav."numberValue"))::text AS max
        ${this.from()}
        ${this.valueJoin(attributeIds)}
       WHERE ${where} AND pav."numberValue" IS NOT NULL
       GROUP BY pav."attributeId"
    `);
  }
}

function valuePredicate(entry: ResolvedFilter): Prisma.Sql {
  const { attribute, filter, optionIds } = entry;
  switch (attribute.type) {
    case AttributeType.OPTION:
      return Prisma.sql`pav."optionValueId" IN (${Prisma.join(optionIds)})`;
    case AttributeType.BOOLEAN:
      return Prisma.sql`pav."booleanValue" IN (${Prisma.join(filter.values.map((value) => value === 'true'))})`;
    case AttributeType.NUMBER:
      if (filter.range) {
        const { min, max } = filter.range;
        return Prisma.join(
          [
            min ? Prisma.sql`pav."numberValue" >= ${min}::numeric` : Prisma.sql`TRUE`,
            max ? Prisma.sql`pav."numberValue" <= ${max}::numeric` : Prisma.sql`TRUE`,
          ],
          ' AND ',
        );
      }
      return Prisma.sql`pav."numberValue" IN (${Prisma.join(filter.values.map((value) => Prisma.sql`${value}::numeric`))})`;
    case AttributeType.TEXT:
    default:
      return Prisma.sql`lower(pav."textValue") IN (${Prisma.join(filter.values.map((value) => value.toLowerCase()))})`;
  }
}

function isBooleanLiteral(value: string): boolean {
  return value === 'true' || value === 'false';
}

/** Escape LIKE wildcards so a user term cannot turn into a pattern. */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}
