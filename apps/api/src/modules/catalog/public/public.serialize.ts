import { AttributeType, Prisma } from '@fakhri/prisma';
import { moneyString } from '../catalog.serialize';

/**
 * Storefront projections (increment 3.3). These are the only shapes public routes
 * return: `costPrice` is deliberately absent from every one of them, and only
 * ACTIVE products with active variants ever reach here.
 */

export type Availability = 'IN_STOCK' | 'AVAILABLE_ON_ORDER' | 'OUT_OF_STOCK';

export interface StockLevel {
  onHand: number;
  reserved: number;
}

export function availabilityOf(stock: StockLevel | undefined, isAvailableOnOrder: boolean): Availability {
  const sellable = (stock?.onHand ?? 0) - (stock?.reserved ?? 0);
  if (sellable > 0) return 'IN_STOCK';
  return isAvailableOnOrder ? 'AVAILABLE_ON_ORDER' : 'OUT_OF_STOCK';
}

/** The best availability across a product's variants is what the PLP/PDP badge shows. */
export function bestAvailability(values: Availability[]): Availability {
  if (values.includes('IN_STOCK')) return 'IN_STOCK';
  if (values.includes('AVAILABLE_ON_ORDER')) return 'AVAILABLE_ON_ORDER';
  return 'OUT_OF_STOCK';
}

export interface SpecView {
  attributeId: string;
  slug: string;
  name: string;
  type: AttributeType;
  unit: string | null;
  group: string | null;
  /** Display value: option label, text, trimmed number, or boolean. */
  value: string | boolean | null;
  /** Normalized option value, so the storefront can build a filter link. */
  optionValue: string | null;
}

type ValueRow = {
  attributeId: string;
  attribute: { id: string; slug: string; name: string; type: AttributeType; unit: string | null };
  optionValue: { id: string; value: string; label: string } | null;
  numberValue: Prisma.Decimal | null;
  booleanValue: boolean | null;
  textValue: string | null;
  jsonValue: Prisma.JsonValue | null;
};

export function specOf(row: ValueRow, group: string | null): SpecView {
  return {
    attributeId: row.attributeId,
    slug: row.attribute.slug,
    name: row.attribute.name,
    type: row.attribute.type,
    unit: row.attribute.unit,
    group,
    value: displayValue(row),
    optionValue: row.optionValue?.value ?? null,
  };
}

function displayValue(row: ValueRow): string | boolean | null {
  if (row.optionValue) return row.optionValue.label;
  if (row.textValue !== null) return row.textValue;
  if (row.numberValue !== null) return trimNumber(row.numberValue);
  if (row.booleanValue !== null) return row.booleanValue;
  if (row.jsonValue !== null) return JSON.stringify(row.jsonValue);
  return null;
}

/** 12.500 -> "12.5", 3.000 -> "3". Decimal(12,3) keeps trailing zeros otherwise. */
export function trimNumber(value: Prisma.Decimal): string {
  return value.toDecimalPlaces(3).toString();
}

export interface PublicVariantView {
  id: string;
  sku: string;
  name: string | null;
  price: string | null;
  compareAtPrice: string | null;
  availability: Availability;
  specs: SpecView[];
}

export function publicVariant(
  row: {
    id: string;
    sku: string;
    name: string | null;
    price: Prisma.Decimal;
    compareAtPrice: Prisma.Decimal | null;
    isAvailableOnOrder: boolean;
    attributeValues: ValueRow[];
  },
  stock: StockLevel | undefined,
  groupOf: (attributeId: string) => string | null,
): PublicVariantView {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    price: moneyString(row.price),
    compareAtPrice: moneyString(row.compareAtPrice),
    availability: availabilityOf(stock, row.isAvailableOnOrder),
    specs: row.attributeValues.map((value) => specOf(value, groupOf(value.attributeId))),
  };
}

export interface PublicImageView {
  url: string;
  alt: string | null;
  variantId: string | null;
  isPrimary: boolean;
}

export function publicImage(row: {
  url: string;
  alt: string | null;
  variantId: string | null;
  isPrimary: boolean;
}): PublicImageView {
  return { url: row.url, alt: row.alt, variantId: row.variantId, isPrimary: row.isPrimary };
}
