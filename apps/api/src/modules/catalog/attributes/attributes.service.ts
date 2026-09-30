import { Injectable } from '@nestjs/common';
import { AttributeType, Prisma } from '@fakhri/prisma';
import { buildMeta, conflict, normalizePagination, notFound } from '@fakhri/shared';
import { AuditService } from '../../../audit/audit.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { parseAttributeValidation } from '../attribute-rules';
import { CATALOG_ACTOR } from '../catalog.constants';
import { inTx, invalid } from '../catalog.errors';
import { iso, readJsonObject } from '../catalog.serialize';
import { requireSlug } from '../catalog.slug';
import {
  CreateAttributeDto,
  CreateAttributeOptionDto,
  ListAttributesQueryDto,
  UpdateAttributeDto,
  UpdateAttributeOptionDto,
} from './attribute.dto';

const optionSelect = { id: true, value: true, label: true, sortOrder: true } as const;

@Injectable()
export class AttributesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateAttributeDto) {
    const slug = requireSlug(dto.name, dto.slug);
    const validation = parseAttributeValidation(dto.type, dto.validation ?? null);
    const id = await inTx(this.prisma, 'Attribute', async (tx) => {
      const created = await tx.attribute.create({
        data: {
          name: dto.name,
          slug,
          description: dto.description,
          type: dto.type,
          unit: dto.unit,
          validation,
          isSearchable: dto.isSearchable,
          isComparable: dto.isComparable,
        },
      });
      await this.audit.log(
        { ...CATALOG_ACTOR, action: 'catalog.attribute.create', entityType: 'Attribute', entityId: created.id, after: { slug, type: dto.type } },
        tx,
      );
      return created.id;
    });
    return this.get(id);
  }

  async list(query: ListAttributesQueryDto) {
    const { skip, take } = normalizePagination(query);
    const where: Prisma.AttributeWhereInput = {};
    if (query.type) where.type = query.type;
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { slug: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.attribute.count({ where }),
      this.prisma.attribute.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take,
        include: { _count: { select: { options: true } } },
      }),
    ]);
    return {
      items: rows.map((row) => ({ ...serializeAttribute(row), optionCount: row._count.options })),
      meta: buildMeta(total, skip, take),
    };
  }

  async get(id: string) {
    const row = await this.prisma.attribute.findUnique({
      where: { id },
      include: { options: { orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }], select: optionSelect } },
    });
    if (!row) throw notFound('Attribute');
    return { ...serializeAttribute(row), options: row.options };
  }

  async update(id: string, dto: UpdateAttributeDto) {
    const existing = await this.prisma.attribute.findUnique({
      where: { id },
      include: { _count: { select: { options: true, values: true } } },
    });
    if (!existing) throw notFound('Attribute');
    const nextType = dto.type ?? existing.type;
    if (dto.type && dto.type !== existing.type && (existing._count.options > 0 || existing._count.values > 0)) {
      throw conflict('Attribute type cannot change after options or values exist');
    }
    const validation =
      dto.validation !== undefined || (dto.type !== undefined && dto.type !== existing.type)
        ? parseAttributeValidation(nextType, dto.type !== undefined && dto.type !== existing.type && dto.validation === undefined ? null : dto.validation)
        : undefined;
    await inTx(this.prisma, 'Attribute', async (tx) => {
      await tx.attribute.update({
        where: { id },
        data: {
          name: dto.name,
          slug: dto.slug,
          description: dto.description,
          type: dto.type,
          unit: dto.unit,
          validation,
          isSearchable: dto.isSearchable,
          isComparable: dto.isComparable,
        },
      });
      await this.audit.log(
        { ...CATALOG_ACTOR, action: 'catalog.attribute.update', entityType: 'Attribute', entityId: id, after: dto },
        tx,
      );
    });
    return this.get(id);
  }

  async remove(id: string): Promise<{ id: string }> {
    const existing = await this.prisma.attribute.findUnique({ where: { id } });
    if (!existing) throw notFound('Attribute');
    const [values, bindings] = await Promise.all([
      this.prisma.productAttributeValue.count({ where: { attributeId: id } }),
      this.prisma.categoryAttribute.count({ where: { attributeId: id } }),
    ]);
    if (values > 0 || bindings > 0) {
      throw conflict('Attribute cannot be deleted while it is bound to categories or used by products', { values, bindings });
    }
    await inTx(this.prisma, 'Attribute', async (tx) => {
      await tx.attribute.delete({ where: { id } });
      await this.audit.log(
        { ...CATALOG_ACTOR, action: 'catalog.attribute.delete', entityType: 'Attribute', entityId: id, before: { slug: existing.slug } },
        tx,
      );
    });
    return { id };
  }

  async createOption(attributeId: string, dto: CreateAttributeOptionDto) {
    const attribute = await this.require(attributeId);
    if (attribute.type !== AttributeType.OPTION) throw invalid('Options can only be added to OPTION attributes');
    const id = await inTx(this.prisma, 'Attribute option', async (tx) => {
      const created = await tx.attributeOption.create({
        data: { attributeId, value: dto.value, label: dto.label, sortOrder: dto.sortOrder },
      });
      await this.audit.log(
        {
          ...CATALOG_ACTOR,
          action: 'catalog.attribute_option.create',
          entityType: 'AttributeOption',
          entityId: created.id,
          after: { attributeId, value: dto.value },
        },
        tx,
      );
      return created.id;
    });
    return this.getOption(attributeId, id);
  }

  async updateOption(attributeId: string, optionId: string, dto: UpdateAttributeOptionDto) {
    await this.getOption(attributeId, optionId);
    await inTx(this.prisma, 'Attribute option', async (tx) => {
      await tx.attributeOption.update({ where: { id: optionId }, data: dto });
      await this.audit.log(
        { ...CATALOG_ACTOR, action: 'catalog.attribute_option.update', entityType: 'AttributeOption', entityId: optionId, after: dto },
        tx,
      );
    });
    return this.getOption(attributeId, optionId);
  }

  async removeOption(attributeId: string, optionId: string): Promise<{ id: string }> {
    await this.getOption(attributeId, optionId);
    const used = await this.prisma.productAttributeValue.count({ where: { optionValueId: optionId } });
    if (used > 0) throw conflict('Option cannot be deleted while products use it', { products: used });
    await inTx(this.prisma, 'Attribute option', async (tx) => {
      await tx.attributeOption.delete({ where: { id: optionId } });
      await this.audit.log(
        { ...CATALOG_ACTOR, action: 'catalog.attribute_option.delete', entityType: 'AttributeOption', entityId: optionId },
        tx,
      );
    });
    return { id: optionId };
  }

  async require(id: string) {
    const row = await this.prisma.attribute.findUnique({ where: { id }, include: { options: true } });
    if (!row) throw notFound('Attribute');
    return row;
  }

  private async getOption(attributeId: string, optionId: string) {
    const option = await this.prisma.attributeOption.findFirst({ where: { id: optionId, attributeId }, select: optionSelect });
    if (!option) throw notFound('Attribute option');
    return option;
  }
}

function serializeAttribute(row: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: AttributeType;
  unit: string | null;
  validation: Prisma.JsonValue | null;
  isSearchable: boolean;
  isComparable: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    type: row.type,
    unit: row.unit,
    validation: readJsonObject(row.validation),
    isSearchable: row.isSearchable,
    isComparable: row.isComparable,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}
