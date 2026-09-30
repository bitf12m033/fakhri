import { Injectable } from '@nestjs/common';
import { AttributeType, Prisma } from '@fakhri/prisma';
import { buildMeta, conflict, normalizePagination, notFound } from '@fakhri/shared';
import { AuditService } from '../../../audit/audit.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CATALOG_ACTOR, CATALOG_LIMITS } from '../catalog.constants';
import { inTx, invalid } from '../catalog.errors';
import { iso, jsonWrite, readSeo, SeoView } from '../catalog.serialize';
import { requireSlug } from '../catalog.slug';
import { SearchDocumentService } from '../search-document.service';
import {
  CategoryAttributeBindingDto,
  CreateCategoryDto,
  ListCategoriesQueryDto,
  UpdateCategoryDto,
} from './category.dto';

export interface CategoryView {
  id: string;
  parentId: string | null;
  slug: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  seo: SeoView | null;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryNode extends CategoryView {
  children: CategoryNode[];
}

export interface TemplateBinding {
  attributeId: string;
  sourceCategoryId: string;
  inherited: boolean;
  group: string | null;
  sortOrder: number;
  isRequired: boolean;
  isFilterable: boolean;
  isComparable: boolean;
  attribute: {
    id: string;
    slug: string;
    name: string;
    type: AttributeType;
    unit: string | null;
    description: string | null;
    options: { id: string; value: string; label: string; sortOrder: number }[];
  };
}

const bindingInclude = {
  attribute: {
    include: { options: { orderBy: [{ sortOrder: 'asc' as const }, { label: 'asc' as const }] } },
  },
} satisfies Prisma.CategoryAttributeInclude;

type BindingRow = Prisma.CategoryAttributeGetPayload<{ include: typeof bindingInclude }>;

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly documents: SearchDocumentService,
  ) {}

  async create(dto: CreateCategoryDto): Promise<CategoryView> {
    const slug = requireSlug(dto.name, dto.slug);
    await this.assertValidParent(null, dto.parentId ?? null);
    const id = await inTx(this.prisma, 'Category', async (tx) => {
      const created = await tx.category.create({
        data: {
          name: dto.name,
          slug,
          parentId: dto.parentId,
          description: dto.description,
          iconUrl: dto.iconUrl,
          sortOrder: dto.sortOrder,
          isActive: dto.isActive,
          seo: jsonWrite(dto.seo),
        },
      });
      await this.audit.log(
        { ...CATALOG_ACTOR, action: 'catalog.category.create', entityType: 'Category', entityId: created.id, after: { slug, name: dto.name } },
        tx,
      );
      return created.id;
    });
    return this.get(id);
  }

  async list(query: ListCategoriesQueryDto): Promise<{ items: CategoryView[]; meta: ReturnType<typeof buildMeta> }> {
    if (query.root === 'true' && query.parentId) throw invalid('Use either root or parentId');
    const { skip, take } = normalizePagination(query);
    const where: Prisma.CategoryWhereInput = {};
    if (query.root === 'true') where.parentId = null;
    else if (query.parentId) where.parentId = query.parentId;
    if (query.isActive) where.isActive = query.isActive === 'true';
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { slug: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.category.count({ where }),
      this.prisma.category.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], skip, take }),
    ]);
    return { items: rows.map(serializeCategory), meta: buildMeta(total, skip, take) };
  }

  async tree(): Promise<CategoryNode[]> {
    const rows = await this.prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    const nodes = new Map<string, CategoryNode>();
    for (const row of rows) nodes.set(row.id, { ...serializeCategory(row), children: [] });
    const roots: CategoryNode[] = [];
    for (const node of nodes.values()) {
      const parent = node.parentId ? nodes.get(node.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return sortTree(roots);
  }

  async get(id: string): Promise<CategoryView> {
    return serializeCategory(await this.require(id));
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryView> {
    const existing = await this.require(id);
    if (dto.parentId !== undefined) await this.assertValidParent(id, dto.parentId);
    await inTx(this.prisma, 'Category', async (tx) => {
      await tx.category.update({
        where: { id },
        data: {
          name: dto.name,
          slug: dto.slug,
          parentId: dto.parentId,
          description: dto.description,
          iconUrl: dto.iconUrl,
          sortOrder: dto.sortOrder,
          isActive: dto.isActive,
          seo: jsonWrite(dto.seo),
        },
      });
      if (dto.name !== undefined && dto.name !== existing.name) {
        await this.documents.refreshByCategory(tx, id);
      }
      await this.audit.log(
        {
          ...CATALOG_ACTOR,
          action: 'catalog.category.update',
          entityType: 'Category',
          entityId: id,
          before: serializeCategory(existing),
          after: dto,
        },
        tx,
      );
    });
    return this.get(id);
  }

  async remove(id: string): Promise<{ id: string }> {
    const existing = await this.require(id);
    const [children, products] = await Promise.all([
      this.prisma.category.count({ where: { parentId: id } }),
      this.prisma.product.count({ where: { categoryId: id } }),
    ]);
    if (children > 0 || products > 0) {
      throw conflict('Category cannot be deleted while it has child categories or products', { children, products });
    }
    await inTx(this.prisma, 'Category', async (tx) => {
      await tx.category.delete({ where: { id } });
      await this.audit.log(
        { ...CATALOG_ACTOR, action: 'catalog.category.delete', entityType: 'Category', entityId: id, before: serializeCategory(existing) },
        tx,
      );
    });
    return { id };
  }

  async listBindings(categoryId: string) {
    await this.require(categoryId);
    const rows = await this.prisma.categoryAttribute.findMany({
      where: { categoryId },
      include: bindingInclude,
      orderBy: [{ sortOrder: 'asc' }, { attribute: { name: 'asc' } }],
    });
    return rows.map((row) => serializeBinding(row, categoryId));
  }

  /** Parent bindings apply to descendants until the child stores its own row for that attribute. */
  async effectiveTemplate(categoryId: string): Promise<TemplateBinding[]> {
    const chain = await this.ancestorChain(categoryId);
    const ids = chain.map((row) => row.id);
    const rows = await this.prisma.categoryAttribute.findMany({
      where: { categoryId: { in: ids } },
      include: bindingInclude,
    });
    const byCategory = new Map<string, BindingRow[]>();
    for (const row of rows) {
      const list = byCategory.get(row.categoryId) ?? [];
      list.push(row);
      byCategory.set(row.categoryId, list);
    }
    const merged = new Map<string, TemplateBinding>();
    for (const id of [...ids].reverse()) {
      for (const row of byCategory.get(id) ?? []) {
        merged.set(row.attributeId, serializeBinding(row, categoryId));
      }
    }
    return [...merged.values()].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.attribute.name.localeCompare(b.attribute.name),
    );
  }

  async replaceBindings(categoryId: string, bindings: CategoryAttributeBindingDto[]) {
    await this.require(categoryId);
    if (bindings.length > CATALOG_LIMITS.bindingsPerCategory) {
      throw invalid(`A category can bind at most ${CATALOG_LIMITS.bindingsPerCategory} attributes`);
    }
    const ids = bindings.map((binding) => binding.attributeId);
    if (new Set(ids).size !== ids.length) throw invalid('Duplicate attribute in bindings');
    if (ids.length > 0) {
      const found = await this.prisma.attribute.findMany({ where: { id: { in: ids } }, select: { id: true } });
      const foundIds = new Set(found.map((row) => row.id));
      const missing = ids.filter((id) => !foundIds.has(id));
      if (missing.length > 0) throw invalid('Unknown attribute in bindings', { attributeIds: missing });
    }
    await inTx(this.prisma, 'Category attribute', async (tx) => {
      await tx.categoryAttribute.deleteMany({ where: { categoryId } });
      if (bindings.length > 0) {
        await tx.categoryAttribute.createMany({
          data: bindings.map((binding) => ({
            categoryId,
            attributeId: binding.attributeId,
            group: binding.group ?? null,
            sortOrder: binding.sortOrder ?? 0,
            isRequired: binding.isRequired ?? false,
            isFilterable: binding.isFilterable ?? false,
            isComparable: binding.isComparable ?? true,
          })),
        });
      }
      await this.audit.log(
        {
          ...CATALOG_ACTOR,
          action: 'catalog.category_attribute.replace',
          entityType: 'Category',
          entityId: categoryId,
          after: { bindings },
        },
        tx,
      );
    });
    return this.listBindings(categoryId);
  }

  async removeBinding(categoryId: string, attributeId: string): Promise<{ categoryId: string; attributeId: string }> {
    await this.require(categoryId);
    const existing = await this.prisma.categoryAttribute.findUnique({
      where: { categoryId_attributeId: { categoryId, attributeId } },
    });
    if (!existing) throw notFound('Category attribute');
    await inTx(this.prisma, 'Category attribute', async (tx) => {
      await tx.categoryAttribute.delete({ where: { categoryId_attributeId: { categoryId, attributeId } } });
      await this.audit.log(
        {
          ...CATALOG_ACTOR,
          action: 'catalog.category_attribute.delete',
          entityType: 'Category',
          entityId: categoryId,
          before: { attributeId },
        },
        tx,
      );
    });
    return { categoryId, attributeId };
  }

  async require(id: string) {
    const row = await this.prisma.category.findUnique({ where: { id } });
    if (!row) throw notFound('Category');
    return row;
  }

  /** Root -> category chain for storefront breadcrumbs (REQ-05). */
  async breadcrumb(categoryId: string): Promise<{ id: string; slug: string; name: string }[]> {
    const chain: { id: string; slug: string; name: string }[] = [];
    const seen = new Set<string>();
    let cursor: string | null = categoryId;
    while (cursor) {
      if (seen.has(cursor)) throw conflict('Category tree contains a cycle');
      if (chain.length >= CATALOG_LIMITS.treeDepth) throw conflict('Category tree is too deep');
      seen.add(cursor);
      const row: { id: string; slug: string; name: string; parentId: string | null } | null =
        await this.prisma.category.findUnique({
          where: { id: cursor },
          select: { id: true, slug: true, name: true, parentId: true },
        });
      if (!row) throw notFound('Category');
      chain.push({ id: row.id, slug: row.slug, name: row.name });
      cursor = row.parentId;
    }
    return chain.reverse();
  }

  /** The category and every descendant. A PLP for a parent lists its whole subtree (REQ-04). */
  async subtreeIds(categoryId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      WITH RECURSIVE subtree AS (
        SELECT id, 1 AS depth FROM "Category" WHERE id = ${categoryId}
        UNION ALL
        SELECT child.id, parent.depth + 1
          FROM "Category" child
          JOIN subtree parent ON child."parentId" = parent.id
         WHERE parent.depth < ${CATALOG_LIMITS.treeDepth}
      )
      SELECT id FROM subtree
    `);
    return rows.map((row) => row.id);
  }

  private async assertValidParent(categoryId: string | null, parentId: string | null): Promise<void> {
    if (!parentId) return;
    if (categoryId && parentId === categoryId) throw conflict('Category cannot be its own parent');
    const chain = await this.ancestorChain(parentId);
    if (categoryId && chain.some((row) => row.id === categoryId)) {
      throw conflict('Category parent would create a cycle');
    }
  }

  private async ancestorChain(categoryId: string): Promise<{ id: string; parentId: string | null }[]> {
    const chain: { id: string; parentId: string | null }[] = [];
    const seen = new Set<string>();
    let cursor: string | null = categoryId;
    while (cursor) {
      if (seen.has(cursor)) throw conflict('Category tree contains a cycle');
      if (chain.length >= CATALOG_LIMITS.treeDepth) throw conflict('Category tree is too deep');
      seen.add(cursor);
      const row: { id: string; parentId: string | null } | null = await this.prisma.category.findUnique({
        where: { id: cursor },
        select: { id: true, parentId: true },
      });
      if (!row) throw notFound('Category');
      chain.push(row);
      cursor = row.parentId;
    }
    return chain;
  }
}

function serializeCategory(row: {
  id: string;
  parentId: string | null;
  slug: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  seo: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}): CategoryView {
  return {
    id: row.id,
    parentId: row.parentId,
    slug: row.slug,
    name: row.name,
    description: row.description,
    iconUrl: row.iconUrl,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    seo: readSeo(row.seo),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function serializeBinding(row: BindingRow, categoryId: string): TemplateBinding {
  return {
    attributeId: row.attributeId,
    sourceCategoryId: row.categoryId,
    inherited: row.categoryId !== categoryId,
    group: row.group,
    sortOrder: row.sortOrder,
    isRequired: row.isRequired,
    isFilterable: row.isFilterable,
    isComparable: row.isComparable,
    attribute: {
      id: row.attribute.id,
      slug: row.attribute.slug,
      name: row.attribute.name,
      type: row.attribute.type,
      unit: row.attribute.unit,
      description: row.attribute.description,
      options: row.attribute.options.map((option) => ({
        id: option.id,
        value: option.value,
        label: option.label,
        sortOrder: option.sortOrder,
      })),
    },
  };
}

function sortTree(nodes: CategoryNode[]): CategoryNode[] {
  nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  for (const node of nodes) sortTree(node.children);
  return nodes;
}
