import { Injectable } from '@nestjs/common';
import { Prisma } from '@fakhri/prisma';
import { buildMeta, conflict, normalizePagination, notFound } from '@fakhri/shared';
import { AuditService } from '../../../audit/audit.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { inTx } from '../catalog.errors';
import { iso, jsonWrite, readSeo, SeoView } from '../catalog.serialize';
import { requireSlug } from '../catalog.slug';
import { SearchDocumentService } from '../search-document.service';
import { CreateBrandDto, ListBrandsQueryDto, UpdateBrandDto } from './brand.dto';

export interface BrandView {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  isActive: boolean;
  seo: SeoView | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class BrandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly documents: SearchDocumentService,
  ) {}

  async create(dto: CreateBrandDto): Promise<BrandView> {
    const slug = requireSlug(dto.name, dto.slug);
    const id = await inTx(this.prisma, 'Brand', async (tx) => {
      const created = await tx.brand.create({
        data: {
          name: dto.name,
          slug,
          description: dto.description,
          logoUrl: dto.logoUrl,
          coverUrl: dto.coverUrl,
          isActive: dto.isActive,
          seo: jsonWrite(dto.seo),
        },
      });
      await this.audit.log(
        { action: 'catalog.brand.create', entityType: 'Brand', entityId: created.id, after: { slug, name: dto.name } },
        tx,
      );
      return created.id;
    });
    return this.get(id);
  }

  async list(query: ListBrandsQueryDto) {
    const { skip, take } = normalizePagination(query);
    const where: Prisma.BrandWhereInput = {};
    if (query.isActive) where.isActive = query.isActive === 'true';
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { slug: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.brand.count({ where }),
      this.prisma.brand.findMany({ where, orderBy: { name: 'asc' }, skip, take }),
    ]);
    return { items: rows.map(serializeBrand), meta: buildMeta(total, skip, take) };
  }

  async get(id: string): Promise<BrandView> {
    return serializeBrand(await this.require(id));
  }

  async update(id: string, dto: UpdateBrandDto): Promise<BrandView> {
    const existing = await this.require(id);
    await inTx(this.prisma, 'Brand', async (tx) => {
      await tx.brand.update({
        where: { id },
        data: {
          name: dto.name,
          slug: dto.slug,
          description: dto.description,
          logoUrl: dto.logoUrl,
          coverUrl: dto.coverUrl,
          isActive: dto.isActive,
          seo: jsonWrite(dto.seo),
        },
      });
      if (dto.name !== undefined && dto.name !== existing.name) {
        await this.documents.refreshByBrand(tx, id);
      }
      await this.audit.log(
        {
          action: 'catalog.brand.update',
          entityType: 'Brand',
          entityId: id,
          before: serializeBrand(existing),
          after: dto,
        },
        tx,
      );
    });
    return this.get(id);
  }

  async remove(id: string): Promise<{ id: string }> {
    const existing = await this.require(id);
    const products = await this.prisma.product.count({ where: { brandId: id } });
    if (products > 0) throw conflict('Brand cannot be deleted while products reference it', { products });
    await inTx(this.prisma, 'Brand', async (tx) => {
      await tx.brand.delete({ where: { id } });
      await this.audit.log(
        { action: 'catalog.brand.delete', entityType: 'Brand', entityId: id, before: serializeBrand(existing) },
        tx,
      );
    });
    return { id };
  }

  async require(id: string) {
    const row = await this.prisma.brand.findUnique({ where: { id } });
    if (!row) throw notFound('Brand');
    return row;
  }
}

function serializeBrand(row: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  isActive: boolean;
  seo: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}): BrandView {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    logoUrl: row.logoUrl,
    coverUrl: row.coverUrl,
    isActive: row.isActive,
    seo: readSeo(row.seo),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}
