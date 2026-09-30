import { Injectable } from '@nestjs/common';
import { Prisma, ProductStatus, ReviewStatus } from '@fakhri/prisma';
import { buildMeta, normalizePagination, notFound } from '@fakhri/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { iso, moneyString, readSeo, SeoView } from '../catalog.serialize';
import { CategoriesService, TemplateBinding } from '../categories/categories.service';
import { ListQueryDto } from '../dto/list-query.dto';
import {
  Availability,
  availabilityOf,
  bestAvailability,
  PublicImageView,
  publicImage,
  publicVariant,
  SpecView,
  specOf,
  StockLevel,
} from './public.serialize';

/** Only an ACTIVE product under an active brand and category is publicly visible. */
export const VISIBLE_PRODUCT = {
  status: ProductStatus.ACTIVE,
  brand: { isActive: true },
  category: { isActive: true },
  variants: { some: { isActive: true } },
} satisfies Prisma.ProductWhereInput;

const valueInclude = {
  attribute: { select: { id: true, slug: true, name: true, type: true, unit: true } },
  optionValue: { select: { id: true, value: true, label: true } },
} satisfies Prisma.ProductAttributeValueInclude;

const cardInclude = {
  brand: { select: { slug: true, name: true } },
  category: { select: { slug: true, name: true } },
  images: { where: { isPrimary: true }, take: 1, orderBy: { sortOrder: 'asc' as const } },
  variants: {
    where: { isActive: true },
    select: { id: true, price: true, compareAtPrice: true, isAvailableOnOrder: true },
    orderBy: { price: 'asc' as const },
  },
} satisfies Prisma.ProductInclude;

const detailInclude = {
  brand: { select: { id: true, slug: true, name: true, logoUrl: true } },
  category: { select: { id: true, slug: true, name: true } },
  images: { orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }, { id: 'asc' as const }] },
  attributeValues: { include: valueInclude },
  variants: {
    where: { isActive: true },
    orderBy: { price: 'asc' as const },
    include: { attributeValues: { include: valueInclude } },
  },
} satisfies Prisma.ProductInclude;

export interface PublicCategoryView {
  slug: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  productCount: number;
}

export interface PublicCategoryNode extends PublicCategoryView {
  children: PublicCategoryNode[];
}

export interface PublicProductCard {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  brand: { slug: string; name: string };
  category: { slug: string; name: string };
  image: PublicImageView | null;
  fromPrice: string | null;
  toPrice: string | null;
  compareAtPrice: string | null;
  availability: Availability;
  isFeatured: boolean;
  variantCount: number;
}

/**
 * Storefront reads of the catalog (increment 3.3). The search module owns which
 * products match a query; this service owns how a product is shown publicly.
 */
@Injectable()
export class StorefrontService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
  ) {}

  /** Active nav tree with rolled-up product counts (REQ-01). */
  async categoryTree(): Promise<PublicCategoryNode[]> {
    const rows = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        parentId: true,
        slug: true,
        name: true,
        description: true,
        iconUrl: true,
        _count: { select: { products: { where: VISIBLE_PRODUCT } } },
      },
    });
    return buildTree(rows);
  }

  /** One category plus its breadcrumb and its own subtree (REQ-01). */
  async categoryWithTree(slug: string) {
    const category = await this.prisma.category.findFirst({ where: { slug, isActive: true } });
    if (!category) throw notFound('Category');
    const ids = await this.categories.subtreeIds(category.id);
    const rows = await this.prisma.category.findMany({
      where: { id: { in: ids }, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        parentId: true,
        slug: true,
        name: true,
        description: true,
        iconUrl: true,
        _count: { select: { products: { where: VISIBLE_PRODUCT } } },
      },
    });
    const breadcrumb = await this.categories.breadcrumb(category.id);
    const tree = buildTree(rows, category.id);
    return {
      slug: category.slug,
      name: category.name,
      description: category.description,
      iconUrl: category.iconUrl,
      seo: readSeo(category.seo),
      breadcrumb: breadcrumb.map((node) => ({ slug: node.slug, name: node.name })),
      productCount: tree[0]?.productCount ?? 0,
      children: tree[0]?.children ?? [],
    };
  }

  /** Active brands, paginated (REQ-02). */
  async brands(query: ListQueryDto) {
    const { skip, take } = normalizePagination(query);
    const where: Prisma.BrandWhereInput = { isActive: true, products: { some: VISIBLE_PRODUCT } };
    if (query.q) where.name = { contains: query.q, mode: 'insensitive' };
    const [total, rows] = await Promise.all([
      this.prisma.brand.count({ where }),
      this.prisma.brand.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take,
        select: {
          slug: true,
          name: true,
          description: true,
          logoUrl: true,
          _count: { select: { products: { where: VISIBLE_PRODUCT } } },
        },
      }),
    ]);
    return {
      items: rows.map((row) => ({
        slug: row.slug,
        name: row.name,
        description: row.description,
        logoUrl: row.logoUrl,
        productCount: row._count.products,
      })),
      meta: buildMeta(total, skip, take),
    };
  }

  async brand(slug: string) {
    const row = await this.prisma.brand.findFirst({
      where: { slug, isActive: true },
      select: {
        slug: true,
        name: true,
        description: true,
        logoUrl: true,
        coverUrl: true,
        seo: true,
        _count: { select: { products: { where: VISIBLE_PRODUCT } } },
      },
    });
    if (!row) throw notFound('Brand');
    return {
      slug: row.slug,
      name: row.name,
      description: row.description,
      logoUrl: row.logoUrl,
      coverUrl: row.coverUrl,
      seo: readSeo(row.seo),
      productCount: row._count.products,
    };
  }

  /** PLP cards for an ordered id list. The order the search module returned is preserved. */
  async cards(ids: string[]): Promise<PublicProductCard[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.product.findMany({
      where: { id: { in: ids }, ...VISIBLE_PRODUCT },
      include: cardInclude,
    });
    const stock = await this.stockByVariant(rows.flatMap((row) => row.variants.map((variant) => variant.id)));
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids
      .map((id) => byId.get(id))
      .filter((row): row is (typeof rows)[number] => row !== undefined)
      .map((row) => {
        const prices = row.variants.map((variant) => variant.price);
        return {
          id: row.id,
          slug: row.slug,
          name: row.name,
          shortDescription: row.shortDescription,
          brand: row.brand,
          category: row.category,
          image: row.images[0] ? publicImage(row.images[0]) : null,
          fromPrice: moneyString(prices[0] ?? null),
          toPrice: moneyString(prices[prices.length - 1] ?? null),
          compareAtPrice: moneyString(row.variants[0]?.compareAtPrice ?? null),
          availability: bestAvailability(
            row.variants.map((variant) =>
              availabilityOf(stock.get(variant.id), variant.isAvailableOnOrder),
            ),
          ),
          isFeatured: row.isFeatured,
          variantCount: row.variants.length,
        };
      });
  }

  /** PDP (REQ-05): spec table from the category template, gallery, prices, availability. */
  async product(slug: string) {
    const row = await this.prisma.product.findFirst({
      where: { slug, ...VISIBLE_PRODUCT },
      include: detailInclude,
    });
    if (!row) throw notFound('Product');

    const [template, breadcrumb, stock, rating] = await Promise.all([
      this.categories.effectiveTemplate(row.categoryId),
      this.categories.breadcrumb(row.categoryId),
      this.stockByVariant(row.variants.map((variant) => variant.id)),
      this.ratingFor(row.id),
    ]);
    const meta = new Map(template.map((binding) => [binding.attributeId, binding]));
    const groupOf = (attributeId: string) => meta.get(attributeId)?.group ?? null;
    const rank = (attributeId: string) => meta.get(attributeId)?.sortOrder ?? Number.MAX_SAFE_INTEGER;

    const specs = row.attributeValues
      .map((value) => specOf(value, groupOf(value.attributeId)))
      .sort((a, b) => rank(a.attributeId) - rank(b.attributeId) || a.name.localeCompare(b.name));
    const variants = row.variants.map((variant) =>
      publicVariant(variant, stock.get(variant.id), groupOf),
    );
    const prices = row.variants.map((variant) => variant.price);

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      brand: row.brand,
      category: { slug: row.category.slug, name: row.category.name },
      breadcrumb: breadcrumb.map((node) => ({ slug: node.slug, name: node.name })),
      shortDescription: row.shortDescription,
      description: row.description,
      warrantyInfo: row.warrantyInfo,
      tags: row.tags,
      seo: readSeo(row.seo) as SeoView | null,
      images: row.images.map(publicImage),
      specGroups: groupSpecs(specs),
      variants,
      fromPrice: moneyString(prices[0] ?? null),
      toPrice: moneyString(prices[prices.length - 1] ?? null),
      availability: bestAvailability(variants.map((variant) => variant.availability)),
      rating,
      publishedAt: row.publishedAt ? iso(row.publishedAt) : null,
    };
  }

  /**
   * Approved reviews only (increment 3.7). Computed here rather than through the
   * reviews module so the storefront projection stays a single query set.
   */
  private async ratingFor(productId: string): Promise<{ average: string | null; count: number }> {
    const summary = await this.prisma.review.aggregate({
      where: { productId, status: ReviewStatus.APPROVED },
      _avg: { rating: true },
      _count: { _all: true },
    });
    return {
      average: summary._avg.rating === null ? null : summary._avg.rating.toFixed(2),
      count: summary._count._all,
    };
  }

  /**
   * Side-by-side specs for 2-4 products (REQ-08). A row is kept only when the
   * attribute is comparable for every product in the set and at least one has a value.
   */
  async compare(ids: string[]) {
    const rows = await this.prisma.product.findMany({
      where: { id: { in: ids }, ...VISIBLE_PRODUCT },
      include: {
        brand: { select: { slug: true, name: true } },
        images: { where: { isPrimary: true }, take: 1 },
        attributeValues: { include: valueInclude },
        variants: { where: { isActive: true }, select: { price: true }, orderBy: { price: 'asc' }, take: 1 },
      },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const ordered = ids.map((id) => byId.get(id)).filter((row): row is (typeof rows)[number] => row !== undefined);
    if (ordered.length === 0) throw notFound('Product');

    const templates = await Promise.all(
      [...new Set(ordered.map((row) => row.categoryId))].map(async (categoryId) => ({
        categoryId,
        bindings: await this.categories.effectiveTemplate(categoryId),
      })),
    );
    const byCategory = new Map(templates.map((entry) => [entry.categoryId, entry.bindings]));
    let shared: Set<string> | null = null;
    const labels = new Map<string, { slug: string; name: string; unit: string | null; sortOrder: number }>();
    for (const row of ordered) {
      const bindings: TemplateBinding[] = byCategory.get(row.categoryId) ?? [];
      const comparable = bindings.filter((binding) => binding.isComparable);
      for (const binding of comparable) {
        labels.set(binding.attributeId, {
          slug: binding.attribute.slug,
          name: binding.attribute.name,
          unit: binding.attribute.unit,
          sortOrder: binding.sortOrder,
        });
      }
      const attributeIds = new Set(comparable.map((binding) => binding.attributeId));
      shared = shared === null ? attributeIds : intersect(shared, attributeIds);
    }

    const specsByProduct = new Map(
      ordered.map((row) => [
        row.id,
        new Map(row.attributeValues.map((value) => [value.attributeId, specOf(value, null)])),
      ]),
    );
    const attributes = [...(shared ?? new Set<string>())].sort(
      (a, b) =>
        (labels.get(a)?.sortOrder ?? 0) - (labels.get(b)?.sortOrder ?? 0) ||
        (labels.get(a)?.name ?? '').localeCompare(labels.get(b)?.name ?? ''),
    );

    const specRows = attributes
      .map((attributeId) => {
        const label = labels.get(attributeId);
        const values = ordered.map((row) => ({
          productId: row.id,
          value: specsByProduct.get(row.id)?.get(attributeId)?.value ?? null,
        }));
        return {
          attributeId,
          slug: label?.slug ?? '',
          name: label?.name ?? '',
          unit: label?.unit ?? null,
          values,
        };
      })
      .filter((specRow) => specRow.values.some((value) => value.value !== null));

    return {
      products: ordered.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        brand: row.brand,
        image: row.images[0] ? publicImage(row.images[0]) : null,
        fromPrice: moneyString(row.variants[0]?.price ?? null),
      })),
      specs: specRows,
    };
  }

  /** Sellable stock per variant, summed across warehouses. */
  async stockByVariant(variantIds: string[]): Promise<Map<string, StockLevel>> {
    if (variantIds.length === 0) return new Map();
    const rows = await this.prisma.inventoryItem.groupBy({
      by: ['variantId'],
      where: { variantId: { in: variantIds }, warehouse: { isActive: true } },
      _sum: { onHand: true, reserved: true },
    });
    return new Map(
      rows.map((row) => [
        row.variantId,
        { onHand: row._sum.onHand ?? 0, reserved: row._sum.reserved ?? 0 },
      ]),
    );
  }
}

function intersect(left: Set<string>, right: Set<string>): Set<string> {
  return new Set([...left].filter((value) => right.has(value)));
}

function groupSpecs(specs: SpecView[]): { group: string | null; specs: SpecView[] }[] {
  const groups: { group: string | null; specs: SpecView[] }[] = [];
  for (const spec of specs) {
    const existing = groups.find((entry) => entry.group === spec.group);
    if (existing) existing.specs.push(spec);
    else groups.push({ group: spec.group, specs: [spec] });
  }
  return groups;
}

type CategoryRow = {
  id: string;
  parentId: string | null;
  slug: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  _count: { products: number };
};

/** Nest rows and roll descendant product counts up into each ancestor. */
function buildTree(rows: CategoryRow[], rootId?: string): PublicCategoryNode[] {
  const nodes = new Map<string, PublicCategoryNode & { id: string; parentId: string | null }>();
  for (const row of rows) {
    nodes.set(row.id, {
      id: row.id,
      parentId: row.parentId,
      slug: row.slug,
      name: row.name,
      description: row.description,
      iconUrl: row.iconUrl,
      productCount: row._count.products,
      children: [],
    });
  }
  const roots: PublicCategoryNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId && node.id !== rootId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  for (const root of roots) rollUp(root);
  return roots;
}

function rollUp(node: PublicCategoryNode): number {
  for (const child of node.children) node.productCount += rollUp(child);
  return node.productCount;
}
