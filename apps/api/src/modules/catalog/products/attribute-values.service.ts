import { Injectable } from '@nestjs/common';
import { AttributeType, Prisma } from '@fakhri/prisma';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  assertJsonValue,
  assertKindMatches,
  assertNumberValue,
  assertTextValue,
  detectValueKind,
} from '../attribute-rules';
import { CATALOG_LIMITS } from '../catalog.constants';
import { invalid } from '../catalog.errors';
import { CategoriesService } from '../categories/categories.service';
import { AttributeValueDto } from '../dto/attribute-value.dto';

export interface PreparedValue {
  attributeId: string;
  optionValueId?: string;
  numberValue?: Prisma.Decimal;
  booleanValue?: boolean;
  textValue?: string;
  jsonValue?: Prisma.InputJsonValue;
}

type AttributeRow = Prisma.AttributeGetPayload<{ include: { options: true } }>;

@Injectable()
export class AttributeValuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
  ) {}

  async prepare(
    inputs: AttributeValueDto[],
    options?: { categoryId: string; enforceRequired: boolean },
  ): Promise<PreparedValue[]> {
    if (inputs.length > CATALOG_LIMITS.valuesPerScope) {
      throw invalid(`At most ${CATALOG_LIMITS.valuesPerScope} attribute values are allowed`);
    }
    const ids = inputs.map((input) => input.attributeId);
    if (new Set(ids).size !== ids.length) throw invalid('Duplicate attribute value');

    const attributes = ids.length
      ? await this.prisma.attribute.findMany({ where: { id: { in: ids } }, include: { options: true } })
      : [];
    const byId = new Map(attributes.map((attribute) => [attribute.id, attribute]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length > 0) throw invalid('Unknown attribute', { attributeIds: missing });

    const prepared = inputs.map((input) => {
      const attribute = byId.get(input.attributeId);
      if (!attribute) throw invalid('Unknown attribute', { attributeId: input.attributeId });
      const kind = detectValueKind(input);
      assertKindMatches(kind, attribute.type, attribute.id);
      return applyValue(attribute, input, kind);
    });

    if (options?.enforceRequired) await this.assertPresent(options.categoryId, new Set(prepared.map((value) => value.attributeId)));
    return prepared;
  }

  /** Product-level values must cover every required binding, including inherited ones. */
  async assertStored(categoryId: string, productId: string): Promise<void> {
    const values = await this.prisma.productAttributeValue.findMany({
      where: { productId },
      select: { attributeId: true },
    });
    await this.assertPresent(categoryId, new Set(values.map((value) => value.attributeId)));
  }

  async write(
    tx: Prisma.TransactionClient,
    scope: { productId: string } | { variantId: string },
    prepared: PreparedValue[],
  ): Promise<void> {
    const where = 'productId' in scope ? { productId: scope.productId } : { variantId: scope.variantId };
    await tx.productAttributeValue.deleteMany({ where });
    if (prepared.length === 0) return;
    await tx.productAttributeValue.createMany({
      data: prepared.map((value) => ({
        ...where,
        attributeId: value.attributeId,
        optionValueId: value.optionValueId,
        numberValue: value.numberValue,
        booleanValue: value.booleanValue,
        textValue: value.textValue,
        jsonValue: value.jsonValue,
      })),
    });
  }

  private async assertPresent(categoryId: string, present: Set<string>): Promise<void> {
    const template = await this.categories.effectiveTemplate(categoryId);
    const missing = template
      .filter((binding) => binding.isRequired && !present.has(binding.attributeId))
      .map((binding) => ({ attributeId: binding.attributeId, slug: binding.attribute.slug, name: binding.attribute.name }));
    if (missing.length > 0) {
      throw invalid(`Required attributes are missing: ${missing.map((entry) => entry.name).join(', ')}`, { missing });
    }
  }
}

function applyValue(attribute: AttributeRow, input: AttributeValueDto, kind: AttributeType): PreparedValue {
  if (kind === AttributeType.OPTION) {
    const option = attribute.options.find((item) => item.id === input.optionValueId);
    if (!option) throw invalid('optionValueId does not belong to this attribute', { attributeId: attribute.id });
    return { attributeId: attribute.id, optionValueId: option.id };
  }
  if (kind === AttributeType.NUMBER) {
    return {
      attributeId: attribute.id,
      numberValue: assertNumberValue(input.numberValue ?? '', attribute.validation, attribute.id),
    };
  }
  if (kind === AttributeType.BOOLEAN) {
    if (typeof input.booleanValue !== 'boolean') {
      throw invalid('booleanValue must be true or false', { attributeId: attribute.id });
    }
    return { attributeId: attribute.id, booleanValue: input.booleanValue };
  }
  if (kind === AttributeType.TEXT) {
    return {
      attributeId: attribute.id,
      textValue: assertTextValue(input.textValue ?? '', attribute.validation, attribute.id),
    };
  }
  return { attributeId: attribute.id, jsonValue: assertJsonValue(input.jsonValue, attribute.id) };
}
