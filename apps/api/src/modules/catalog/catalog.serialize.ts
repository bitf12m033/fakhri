import { AttributeType, Prisma } from '@fakhri/prisma';

export interface SeoView {
  title?: string;
  description?: string;
  keywords?: string[];
}

export function iso(date: Date): string {
  return date.toISOString();
}

export function readSeo(value: Prisma.JsonValue | null): SeoView | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as SeoView;
}

export function readJsonObject(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function moneyString(value: { toFixed(places: number): string } | null): string | null {
  return value ? value.toFixed(2) : null;
}

export function decimalString(value: { toString(): string } | null): string | null {
  return value ? value.toString() : null;
}

export interface AttributeValueView {
  id: string;
  attributeId: string;
  attribute: { id: string; slug: string; name: string; type: AttributeType; unit: string | null };
  optionValueId: string | null;
  option: { id: string; value: string; label: string } | null;
  numberValue: string | null;
  booleanValue: boolean | null;
  textValue: string | null;
  jsonValue: Prisma.JsonValue | null;
}

export function serializeAttributeValue(row: {
  id: string;
  attributeId: string;
  attribute: AttributeValueView['attribute'];
  optionValueId: string | null;
  optionValue: AttributeValueView['option'];
  numberValue: { toString(): string } | null;
  booleanValue: boolean | null;
  textValue: string | null;
  jsonValue: Prisma.JsonValue | null;
}): AttributeValueView {
  return {
    id: row.id,
    attributeId: row.attributeId,
    attribute: row.attribute,
    optionValueId: row.optionValueId,
    option: row.optionValue,
    numberValue: decimalString(row.numberValue),
    booleanValue: row.booleanValue,
    textValue: row.textValue,
    jsonValue: row.jsonValue,
  };
}

export function jsonWrite(
  value: SeoView | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
