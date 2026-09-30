import { Injectable } from '@nestjs/common';
import { Prisma, ProductStatus } from '@fakhri/prisma';
import { buildMeta, conflict, normalizePagination, notFound } from '@fakhri/shared';
import { AuditService } from '../../../audit/audit.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CATALOG_ACTOR, CATALOG_LIMITS, PRODUCT_PUBLISHED } from '../catalog.constants';
import { inTx, invalid } from '../catalog.errors';
import {
  iso,
  jsonWrite,
  moneyString,
  readSeo,
  serializeAttributeValue,
} from '../catalog.serialize';
import { requireSlug } from '../catalog.slug';
import { BrandsService } from '../brands/brands.service';
import { CategoriesService } from '../categories/categories.service';
import { SearchDocumentService } from '../search-document.service';
import { AttributeValueDto } from '../dto/attribute-value.dto';
import { AttributeValuesService, PreparedValue } from './attribute-values.service';
import {
  CreateImageDto,
  CreateProductDto,
  ListProductsQueryDto,
  UpdateImageDto,
  UpdateProductDto,
  UpdateVariantDto,
  VariantInputDto,
} from './product.dto';

const valueInclude = {
  attribute: { select: { id: true, slug: true, name: true, type: true, unit: true } },
  optionValue: { select: { id: true, value: true, label: true } },
} satisfies Prisma.ProductAttributeValueInclude;

const productInclude = {
  brand: { select: { id: true, slug: true, name: true } },
  category: { select: { id: true, slug: true, name: true } },
  variants: {
    orderBy: { sku: 'asc' as const },
    include: {
      attributeValues: { include: valueInclude, orderBy: { attribute: { name: 'asc' as const } } },
    },
  },
  images: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] },
  attributeValues: { include: valueInclude, orderBy: { attribute: { name: 'asc' as const } } },
} satisfies Prisma.ProductInclude;

type ProductDetail = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly brands: BrandsService,
    private readonly categories: CategoriesService,
    private readonly values: AttributeValuesService,
    private readonly documents: SearchDocumentService,
  ) {}

  async create(dto: CreateProductDto) {
    const slug = requireSlug(dto.name, dto.slug);
    const status = dto.status ?? ProductStatus.DRAFT;
    const brand = await this.brands.require(dto.brandId);
    const category = await this.categories.require(dto.categoryId);
    if (status === ProductStatus.ACTIVE) this.assertSellable(brand.isActive, category.isActive);
    const plans = await this.planVariants(dto.variants ?? []);
    if (status === ProductStatus.ACTIVE && !plans.some((plan) => plan.isActive)) {
      throw invalid('An active product needs at least one active variant');
    }
    const images = dto.images ?? [];
    if (images.length > CATALOG_LIMITS.imagesPerProduct) throw invalid(`A product can have at most ${CATALOG_LIMITS.imagesPerProduct} images`);
    if (images.filter((image) => image.isPrimary).length > 1) throw invalid('Only one image can be primary');
    const attributeValues = await this.values.prepare(dto.attributeValues ?? [], {
      categoryId: dto.categoryId,
      enforceRequired: status === ProductStatus.ACTIVE,
    });

    const id = await inTx(this.prisma, 'Product', async (tx) => {
      const created = await tx.product.create({
        data: {
          name: dto.name,
          slug,
          brandId: dto.brandId,
          categoryId: dto.categoryId,
          shortDescription: dto.shortDescription,
          description: dto.description,
          warrantyInfo: dto.warrantyInfo,
          tags: dto.tags ?? [],
          status,
          isFeatured: dto.isFeatured,
          publishedAt: status === ProductStatus.ACTIVE ? new Date() : undefined,
          seo: jsonWrite(dto.seo),
        },
      });
      for (const plan of plans) {
        const variant = await tx.productVariant.create({ data: variantData(created.id, plan) });
        await this.values.write(tx, { variantId: variant.id }, plan.values);
      }
      await this.values.write(tx, { productId: created.id }, attributeValues);
      if (images.length > 0) {
        await tx.productImage.createMany({
          data: images.map((image) => ({
            productId: created.id,
            url: image.url,
            alt: image.alt,
            sortOrder: image.sortOrder ?? 0,
            isPrimary: image.isPrimary ?? false,
          })),
        });
      }
      if (status === ProductStatus.ACTIVE) await this.publish(tx, created.id, slug);
      await this.documents.refreshProduct(tx, created.id);
      await this.audit.log(
        { ...CATALOG_ACTOR, action: 'catalog.product.create', entityType: 'Product', entityId: created.id, after: { slug, status } },
        tx,
      );
      return created.id;
    });
    return this.get(id);
  }

  async list(query: ListProductsQueryDto) {
    const { skip, take } = normalizePagination(query);
    const where: Prisma.ProductWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.brandId) where.brandId = query.brandId;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { slug: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
        include: {
          brand: { select: { id: true, slug: true, name: true } },
          category: { select: { id: true, slug: true, name: true } },
          _count: { select: { variants: true, images: true } },
          variants: { select: { price: true }, orderBy: { price: 'asc' }, take: 1 },
        },
      }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        status: row.status,
        isFeatured: row.isFeatured,
        brand: row.brand,
        category: row.category,
        fromPrice: moneyString(row.variants[0]?.price ?? null),
        variantCount: row._count.variants,
        imageCount: row._count.images,
        publishedAt: row.publishedAt ? iso(row.publishedAt) : null,
        updatedAt: iso(row.updatedAt),
      })),
      meta: buildMeta(total, skip, take),
    };
  }

  async get(id: string) {
    const row = await this.prisma.product.findUnique({ where: { id }, include: productInclude });
    if (!row) throw notFound('Product');
    return serializeProduct(row);
  }

  async update(id: string, dto: UpdateProductDto) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      include: { variants: { select: { isActive: true } } },
    });
    if (!existing) throw notFound('Product');
    const nextStatus = dto.status ?? existing.status;
    const categoryId = dto.categoryId ?? existing.categoryId;
    const brandId = dto.brandId ?? existing.brandId;
    const publishing = existing.status !== ProductStatus.ACTIVE && nextStatus === ProductStatus.ACTIVE;
    if (nextStatus === ProductStatus.ACTIVE) {
      const [brand, category] = await Promise.all([this.brands.require(brandId), this.categories.require(categoryId)]);
      this.assertSellable(brand.isActive, category.isActive);
      if (!existing.variants.some((variant) => variant.isActive)) {
        throw invalid('An active product needs at least one active variant');
      }
      await this.values.assertStored(categoryId, id);
    } else if (dto.categoryId || dto.brandId) {
      if (dto.categoryId) await this.categories.require(dto.categoryId);
      if (dto.brandId) await this.brands.require(dto.brandId);
    }

    await inTx(this.prisma, 'Product', async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: {
          name: dto.name,
          slug: dto.slug,
          brandId: dto.brandId,
          categoryId: dto.categoryId,
          shortDescription: dto.shortDescription,
          description: dto.description,
          warrantyInfo: dto.warrantyInfo,
          tags: dto.tags,
          status: dto.status,
          isFeatured: dto.isFeatured,
          seo: jsonWrite(dto.seo),
          publishedAt: publishing && !existing.publishedAt ? new Date() : undefined,
        },
      });
      if (publishing) await this.publish(tx, id, updated.slug);
      await this.documents.refreshProduct(tx, id);
      await this.audit.log(
        { ...CATALOG_ACTOR, action: 'catalog.product.update', entityType: 'Product', entityId: id, after: dto },
        tx,
      );
    });
    return this.get(id);
  }

  async remove(id: string): Promise<{ id: string }> {
    await this.get(id);
    await inTx(this.prisma, 'Product', async (tx) => {
      await tx.product.delete({ where: { id } });
      await this.audit.log({ ...CATALOG_ACTOR, action: 'catalog.product.delete', entityType: 'Product', entityId: id }, tx);
    });
    return { id };
  }

  async listVariants(productId: string) {
    await this.get(productId);
    const product = await this.prisma.product.findUniqueOrThrow({ where: { id: productId }, include: productInclude });
    return product.variants.map(serializeVariant);
  }

  async createVariant(productId: string, dto: VariantInputDto) {
    await this.requireProduct(productId);
    const count = await this.prisma.productVariant.count({ where: { productId } });
    if (count >= CATALOG_LIMITS.variantsPerProduct) {
      throw invalid(`A product can have at most ${CATALOG_LIMITS.variantsPerProduct} variants`);
    }
    const [plan] = await this.planVariants([dto]);
    if (!plan) throw invalid('Variant is required');
    const id = await inTx(this.prisma, 'Variant', async (tx) => {
      const created = await tx.productVariant.create({ data: variantData(productId, plan) });
      await this.values.write(tx, { variantId: created.id }, plan.values);
      await this.documents.refreshProduct(tx, productId);
      await this.audit.log(
        { ...CATALOG_ACTOR, action: 'catalog.variant.create', entityType: 'ProductVariant', entityId: created.id, after: { sku: dto.sku, productId } },
        tx,
      );
      return created.id;
    });
    return this.variant(productId, id);
  }

  async updateVariant(productId: string, variantId: string, dto: UpdateVariantDto) {
    const product = await this.requireProduct(productId);
    const existing = await this.requireVariant(productId, variantId);
    const price = dto.price !== undefined ? parseMoney(dto.price, 'price') : existing.price.toFixed(2);
    const compareAt = dto.compareAtPrice === undefined
      ? moneyString(existing.compareAtPrice)
      : dto.compareAtPrice === null
        ? null
        : parseMoney(dto.compareAtPrice, 'compareAtPrice');
    assertCompareAt(price, compareAt);
    const costPrice = dto.costPrice === undefined
      ? moneyString(existing.costPrice)
      : dto.costPrice === null
        ? null
        : parseMoney(dto.costPrice, 'costPrice');
    const nextActive = dto.isActive ?? existing.isActive;
    if (product.status === ProductStatus.ACTIVE && existing.isActive && !nextActive) {
      await this.assertActiveVariantRemains(productId, variantId);
    }
    await inTx(this.prisma, 'Variant', async (tx) => {
      await tx.productVariant.update({
        where: { id: variantId },
        data: {
          sku: dto.sku,
          name: dto.name,
          barcode: dto.barcode,
          price,
          compareAtPrice: compareAt,
          costPrice,
          weightKg: resolveDecimal(dto.weightKg, '99999.999', 'weightKg'),
          heightCm: resolveDecimal(dto.heightCm, '99999.99', 'heightCm'),
          widthCm: resolveDecimal(dto.widthCm, '99999.99', 'widthCm'),
          depthCm: resolveDecimal(dto.depthCm, '99999.99', 'depthCm'),
          isActive: dto.isActive,
          isAvailableOnOrder: dto.isAvailableOnOrder,
        },
      });
      await this.documents.refreshProduct(tx, productId);
      await this.audit.log(
        { ...CATALOG_ACTOR, action: 'catalog.variant.update', entityType: 'ProductVariant', entityId: variantId, after: dto },
        tx,
      );
    });
    return this.variant(productId, variantId);
  }

  async removeVariant(productId: string, variantId: string): Promise<{ id: string }> {
    const product = await this.requireProduct(productId);
    const existing = await this.requireVariant(productId, variantId);
    if (product.status === ProductStatus.ACTIVE && existing.isActive) {
      await this.assertActiveVariantRemains(productId, variantId);
    }
    await inTx(this.prisma, 'Variant', async (tx) => {
      await tx.productVariant.delete({ where: { id: variantId } });
      await this.documents.refreshProduct(tx, productId);
      await this.audit.log(
        { ...CATALOG_ACTOR, action: 'catalog.variant.delete', entityType: 'ProductVariant', entityId: variantId },
        tx,
      );
    });
    return { id: variantId };
  }

  async listImages(productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, include: { images: productInclude.images } });
    if (!product) throw notFound('Product');
    return product.images.map(serializeImage);
  }

  async createImage(productId: string, dto: CreateImageDto) {
    await this.requireProduct(productId);
    if (dto.variantId) await this.requireVariant(productId, dto.variantId);
    const count = await this.prisma.productImage.count({ where: { productId } });
    if (count >= CATALOG_LIMITS.imagesPerProduct) throw invalid(`A product can have at most ${CATALOG_LIMITS.imagesPerProduct} images`);
    const id = await inTx(this.prisma, 'Image', async (tx) => {
      if (dto.isPrimary) await tx.productImage.updateMany({ where: { productId, isPrimary: true }, data: { isPrimary: false } });
      const created = await tx.productImage.create({
        data: {
          productId,
          variantId: dto.variantId,
          url: dto.url,
          alt: dto.alt,
          sortOrder: dto.sortOrder ?? 0,
          isPrimary: dto.isPrimary ?? false,
        },
      });
      await this.audit.log(
        { ...CATALOG_ACTOR, action: 'catalog.image.create', entityType: 'ProductImage', entityId: created.id, after: { productId, url: dto.url } },
        tx,
      );
      return created.id;
    });
    return this.image(productId, id);
  }

  async updateImage(productId: string, imageId: string, dto: UpdateImageDto) {
    await this.image(productId, imageId);
    if (dto.variantId) await this.requireVariant(productId, dto.variantId);
    await inTx(this.prisma, 'Image', async (tx) => {
      if (dto.isPrimary) {
        await tx.productImage.updateMany({ where: { productId, isPrimary: true, NOT: { id: imageId } }, data: { isPrimary: false } });
      }
      await tx.productImage.update({
        where: { id: imageId },
        data: {
          url: dto.url,
          alt: dto.alt,
          sortOrder: dto.sortOrder,
          isPrimary: dto.isPrimary,
          variantId: dto.variantId,
        },
      });
      await this.audit.log(
        { ...CATALOG_ACTOR, action: 'catalog.image.update', entityType: 'ProductImage', entityId: imageId, after: dto },
        tx,
      );
    });
    return this.image(productId, imageId);
  }

  async removeImage(productId: string, imageId: string): Promise<{ id: string }> {
    await this.image(productId, imageId);
    await inTx(this.prisma, 'Image', async (tx) => {
      await tx.productImage.delete({ where: { id: imageId } });
      await this.audit.log({ ...CATALOG_ACTOR, action: 'catalog.image.delete', entityType: 'ProductImage', entityId: imageId }, tx);
    });
    return { id: imageId };
  }

  async replaceAttributeValues(productId: string, inputs: AttributeValueDto[]) {
    const product = await this.requireProduct(productId);
    const prepared = await this.values.prepare(
      inputs,
      product.status === ProductStatus.ACTIVE ? { categoryId: product.categoryId, enforceRequired: true } : undefined,
    );
    await inTx(this.prisma, 'Product attribute value', async (tx) => {
      await this.values.write(tx, { productId }, prepared);
      await this.documents.refreshProduct(tx, productId);
      await this.audit.log(
        { ...CATALOG_ACTOR, action: 'catalog.product_attribute_values.replace', entityType: 'Product', entityId: productId, after: { count: prepared.length } },
        tx,
      );
    });
    return this.productValues(productId);
  }

  async replaceVariantAttributeValues(productId: string, variantId: string, inputs: AttributeValueDto[]) {
    await this.requireVariant(productId, variantId);
    const prepared = await this.values.prepare(inputs);
    await inTx(this.prisma, 'Variant attribute value', async (tx) => {
      await this.values.write(tx, { variantId }, prepared);
      await this.documents.refreshProduct(tx, productId);
      await this.audit.log(
        {
          ...CATALOG_ACTOR,
          action: 'catalog.variant_attribute_values.replace',
          entityType: 'ProductVariant',
          entityId: variantId,
          after: { count: prepared.length },
        },
        tx,
      );
    });
    return this.variantValues(variantId);
  }

  private async planVariants(variants: VariantInputDto[]): Promise<VariantPlan[]> {
    if (variants.length > CATALOG_LIMITS.variantsPerProduct) {
      throw invalid(`A product can have at most ${CATALOG_LIMITS.variantsPerProduct} variants`);
    }
    const skus = variants.map((variant) => variant.sku);
    if (new Set(skus).size !== skus.length) throw invalid('Duplicate SKU in variants');
    const plans: VariantPlan[] = [];
    for (const variant of variants) {
      const price = parseMoney(variant.price, 'price');
      const compareAtPrice = variant.compareAtPrice == null ? null : parseMoney(variant.compareAtPrice, 'compareAtPrice');
      assertCompareAt(price, compareAtPrice);
      plans.push({
        dto: variant,
        price,
        compareAtPrice,
        costPrice: variant.costPrice == null ? null : parseMoney(variant.costPrice, 'costPrice'),
        isActive: variant.isActive ?? true,
        values: await this.values.prepare(variant.attributeValues ?? []),
      });
    }
    return plans;
  }

  private async publish(tx: Prisma.TransactionClient, productId: string, slug: string): Promise<void> {
    await this.outbox.enqueue(
      {
        type: PRODUCT_PUBLISHED,
        aggregateType: 'Product',
        aggregateId: productId,
        payload: { productId, slug, publishedAt: new Date().toISOString() },
      },
      tx,
    );
  }

  private assertSellable(brandActive: boolean, categoryActive: boolean): void {
    if (!brandActive) throw invalid('Cannot publish a product for an inactive brand');
    if (!categoryActive) throw invalid('Cannot publish a product in an inactive category');
  }

  private async assertActiveVariantRemains(productId: string, exceptId?: string): Promise<void> {
    const others = await this.prisma.productVariant.count({
      where: { productId, isActive: true, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    });
    if (others === 0) throw conflict('Active product must keep an active variant');
  }

  private async requireProduct(id: string) {
    const row = await this.prisma.product.findUnique({ where: { id } });
    if (!row) throw notFound('Product');
    return row;
  }

  private async requireVariant(productId: string, variantId: string) {
    const row = await this.prisma.productVariant.findFirst({ where: { id: variantId, productId } });
    if (!row) throw notFound('Variant');
    return row;
  }

  private async variant(productId: string, variantId: string) {
    const row = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId },
      include: { attributeValues: { include: valueInclude, orderBy: { attribute: { name: 'asc' } } } },
    });
    if (!row) throw notFound('Variant');
    return serializeVariant(row);
  }

  private async image(productId: string, imageId: string) {
    const row = await this.prisma.productImage.findFirst({ where: { id: imageId, productId } });
    if (!row) throw notFound('Image');
    return serializeImage(row);
  }

  private async productValues(productId: string) {
    const rows = await this.prisma.productAttributeValue.findMany({
      where: { productId },
      include: valueInclude,
      orderBy: { attribute: { name: 'asc' } },
    });
    return rows.map(serializeAttributeValue);
  }

  private async variantValues(variantId: string) {
    const rows = await this.prisma.productAttributeValue.findMany({
      where: { variantId },
      include: valueInclude,
      orderBy: { attribute: { name: 'asc' } },
    });
    return rows.map(serializeAttributeValue);
  }
}

interface VariantPlan {
  dto: VariantInputDto;
  values: PreparedValue[];
  price: string;
  compareAtPrice: string | null;
  costPrice: string | null;
  isActive: boolean;
}

function variantData(productId: string, plan: VariantPlan): Prisma.ProductVariantCreateInput {
  return {
    product: { connect: { id: productId } },
    sku: plan.dto.sku,
    name: plan.dto.name,
    barcode: plan.dto.barcode,
    price: plan.price,
    compareAtPrice: plan.compareAtPrice,
    costPrice: plan.costPrice,
    weightKg: boundDecimal(plan.dto.weightKg, '99999.999', 'weightKg'),
    heightCm: boundDecimal(plan.dto.heightCm, '99999.99', 'heightCm'),
    widthCm: boundDecimal(plan.dto.widthCm, '99999.99', 'widthCm'),
    depthCm: boundDecimal(plan.dto.depthCm, '99999.99', 'depthCm'),
    isActive: plan.isActive,
    isAvailableOnOrder: plan.dto.isAvailableOnOrder,
  };
}

function serializeProduct(row: ProductDetail) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    category: row.category,
    shortDescription: row.shortDescription,
    description: row.description,
    warrantyInfo: row.warrantyInfo,
    tags: row.tags,
    status: row.status,
    isFeatured: row.isFeatured,
    publishedAt: row.publishedAt ? iso(row.publishedAt) : null,
    seo: readSeo(row.seo),
    attributeValues: row.attributeValues.map(serializeAttributeValue),
    variants: row.variants.map(serializeVariant),
    images: row.images.map(serializeImage),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function serializeVariant(row: ProductDetail['variants'][number]) {
  return {
    id: row.id,
    sku: row.sku,
    barcode: row.barcode,
    name: row.name,
    price: moneyString(row.price),
    compareAtPrice: moneyString(row.compareAtPrice),
    costPrice: moneyString(row.costPrice),
    weightKg: row.weightKg?.toString() ?? null,
    heightCm: row.heightCm?.toString() ?? null,
    widthCm: row.widthCm?.toString() ?? null,
    depthCm: row.depthCm?.toString() ?? null,
    isActive: row.isActive,
    isAvailableOnOrder: row.isAvailableOnOrder,
    attributeValues: row.attributeValues.map(serializeAttributeValue),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function serializeImage(row: { id: string; variantId: string | null; url: string; alt: string | null; sortOrder: number; isPrimary: boolean }) {
  return {
    id: row.id,
    variantId: row.variantId,
    url: row.url,
    alt: row.alt,
    sortOrder: row.sortOrder,
    isPrimary: row.isPrimary,
  };
}

function parseMoney(value: string, label: string): string {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw invalid(`${label} must be a non-negative amount with up to 2 decimal places`);
  const amount = new Prisma.Decimal(value);
  if (amount.comparedTo('9999999999.99') > 0) throw invalid(`${label} exceeds the allowed range`);
  return amount.toFixed(2);
}

function assertCompareAt(price: string, compareAt: string | null): void {
  if (compareAt !== null && new Prisma.Decimal(compareAt).comparedTo(price) < 0) {
    throw invalid('compareAtPrice must be greater than or equal to price');
  }
}

function resolveDecimal(incoming: string | null | undefined, max: string, label: string): string | null | undefined {
  if (incoming === undefined) return undefined;
  return boundDecimal(incoming, max, label);
}

function boundDecimal(value: string | null | undefined, max: string, label: string): string | null | undefined {
  if (value == null) return value;
  if (new Prisma.Decimal(value).comparedTo(max) > 0) throw invalid(`${label} exceeds the allowed range`);
  return value;
}
