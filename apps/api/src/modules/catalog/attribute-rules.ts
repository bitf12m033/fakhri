import { AttributeType, Prisma } from '@fakhri/prisma';
import { invalid } from './catalog.errors';

export interface RawAttributeValue {
  attributeId: string;
  optionValueId?: string | null;
  numberValue?: string | null;
  booleanValue?: boolean | null;
  textValue?: string | null;
  jsonValue?: unknown;
}

const DECIMAL = /^\d+(\.\d{1,3})?$/;

/** Exactly one typed column may be set (PAV_exactly_one_value_kind). */
export function detectValueKind(input: RawAttributeValue): AttributeType {
  const present: AttributeType[] = [];
  if (input.optionValueId != null) present.push(AttributeType.OPTION);
  if (input.numberValue != null) present.push(AttributeType.NUMBER);
  if (input.booleanValue != null) present.push(AttributeType.BOOLEAN);
  if (input.textValue != null) present.push(AttributeType.TEXT);
  if (input.jsonValue != null) present.push(AttributeType.JSON);
  if (present.length !== 1) {
    throw invalid(
      present.length === 0
        ? 'Attribute value is missing'
        : 'Attribute value must set exactly one typed field',
      { attributeId: input.attributeId },
    );
  }
  return present[0]!;
}

export function assertKindMatches(kind: AttributeType, type: AttributeType, attributeId: string): void {
  if (kind !== type) {
    throw invalid(`Attribute expects a ${type} value`, { attributeId, expected: type, received: kind });
  }
}

/** Persist validation rules as exact strings. Non-NUMBER/TEXT types accept only an empty object. */
export function parseAttributeValidation(
  type: AttributeType,
  validation: unknown,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (validation == null) return Prisma.DbNull;
  if (typeof validation !== 'object' || Array.isArray(validation)) throw invalid('validation must be an object');
  const raw = validation as Record<string, unknown>;
  if (type === AttributeType.NUMBER) return numberRules(raw);
  if (type === AttributeType.TEXT) return textRules(raw);
  if (Object.keys(raw).length > 0) throw invalid(`${type} attributes do not accept validation rules`);
  return Prisma.DbNull;
}

export function assertNumberValue(
  value: string,
  validation: Prisma.JsonValue | null,
  attributeId: string,
): Prisma.Decimal {
  if (!DECIMAL.test(value)) {
    throw invalid('numberValue must be a non-negative decimal with up to 3 places', { attributeId });
  }
  const n = new Prisma.Decimal(value);
  if (n.comparedTo('999999999.999') > 0) throw invalid('numberValue exceeds the allowed range', { attributeId });
  const rules = readDecimalRules(validation);
  if (rules.min && n.comparedTo(rules.min) < 0) throw invalid('numberValue is below the minimum', { attributeId });
  if (rules.max && n.comparedTo(rules.max) > 0) throw invalid('numberValue is above the maximum', { attributeId });
  if (rules.step) {
    const origin = rules.min ?? new Prisma.Decimal(0);
    if (!n.minus(origin).modulo(rules.step).isZero()) {
      throw invalid('numberValue does not match the step', { attributeId });
    }
  }
  return n;
}

export function assertTextValue(value: string, validation: Prisma.JsonValue | null, attributeId: string): string {
  const text = value.trim();
  if (!text) throw invalid('textValue cannot be blank', { attributeId });
  const rules = readTextRules(validation);
  const max = rules.maxLength ?? 2000;
  if (text.length > max) throw invalid('textValue is too long', { attributeId, maxLength: max });
  if (rules.pattern && !new RegExp(rules.pattern).test(text)) {
    throw invalid('textValue does not match the required pattern', { attributeId });
  }
  return text;
}

export function assertJsonValue(value: unknown, attributeId: string): Prisma.InputJsonValue {
  if (value === null || typeof value !== 'object') {
    throw invalid('jsonValue must be a JSON object or array', { attributeId });
  }
  const encoded = JSON.stringify(value);
  if (encoded.length > 10_000) throw invalid('jsonValue is too large', { attributeId });
  return value as Prisma.InputJsonValue;
}

function numberRules(raw: Record<string, unknown>): Prisma.InputJsonValue {
  const allowed = new Set(['min', 'max', 'step']);
  rejectUnknown(raw, allowed);
  const rules: Record<string, string> = {};
  for (const key of ['min', 'max', 'step'] as const) {
    if (raw[key] !== undefined) rules[key] = decimalRule(raw[key], `validation.${key}`);
  }
  if (rules.min !== undefined && rules.max !== undefined && new Prisma.Decimal(rules.min).comparedTo(rules.max) > 0) {
    throw invalid('validation.min cannot exceed validation.max');
  }
  if (rules.step !== undefined && new Prisma.Decimal(rules.step).isZero()) {
    throw invalid('validation.step must be positive');
  }
  return rules;
}

function textRules(raw: Record<string, unknown>): Prisma.InputJsonValue {
  rejectUnknown(raw, new Set(['pattern', 'maxLength']));
  const rules: Record<string, string | number> = {};
  if (raw.pattern !== undefined) {
    if (typeof raw.pattern !== 'string' || raw.pattern.length === 0 || raw.pattern.length > 200) {
      throw invalid('validation.pattern must be a regular expression of at most 200 characters');
    }
    try {
      new RegExp(raw.pattern);
    } catch {
      throw invalid('validation.pattern is not a valid regular expression');
    }
    rules.pattern = raw.pattern;
  }
  if (raw.maxLength !== undefined) {
    if (typeof raw.maxLength !== 'number' || !Number.isInteger(raw.maxLength) || raw.maxLength < 1 || raw.maxLength > 5000) {
      throw invalid('validation.maxLength must be an integer from 1 to 5000');
    }
    rules.maxLength = raw.maxLength;
  }
  return rules;
}

function decimalRule(value: unknown, label: string): string {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) {
      throw invalid(`${label} must be a non-negative integer or a decimal string`);
    }
    return String(value);
  }
  if (typeof value === 'string' && DECIMAL.test(value) && !/^0\d/.test(value)) return value;
  throw invalid(`${label} must be a non-negative decimal with up to 3 places`);
}

function rejectUnknown(raw: Record<string, unknown>, allowed: Set<string>): void {
  const extra = Object.keys(raw).filter((key) => !allowed.has(key));
  if (extra.length > 0) throw invalid('validation has unknown fields', { fields: extra });
}

function readDecimalRules(validation: Prisma.JsonValue | null): {
  min?: Prisma.Decimal;
  max?: Prisma.Decimal;
  step?: Prisma.Decimal;
} {
  if (!validation || typeof validation !== 'object' || Array.isArray(validation)) return {};
  const raw = validation as Record<string, unknown>;
  const out: { min?: Prisma.Decimal; max?: Prisma.Decimal; step?: Prisma.Decimal } = {};
  for (const key of ['min', 'max', 'step'] as const) {
    const value = raw[key];
    if (typeof value === 'string' || typeof value === 'number') out[key] = new Prisma.Decimal(value);
  }
  return out;
}

function readTextRules(validation: Prisma.JsonValue | null): { pattern?: string; maxLength?: number } {
  if (!validation || typeof validation !== 'object' || Array.isArray(validation)) return {};
  const raw = validation as Record<string, unknown>;
  return {
    pattern: typeof raw.pattern === 'string' ? raw.pattern : undefined,
    maxLength: typeof raw.maxLength === 'number' ? raw.maxLength : undefined,
  };
}
