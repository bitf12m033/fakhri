import { AttributeType, Prisma } from '@fakhri/prisma';
import { describe, expect, it } from 'vitest';
import {
  assertJsonValue,
  assertKindMatches,
  assertNumberValue,
  assertTextValue,
  detectValueKind,
  parseAttributeValidation,
} from '../src/modules/catalog/attribute-rules';
import { AppError } from '@fakhri/shared';

describe('catalog attribute rules', () => {
  it('requires exactly one typed value and keeps boolean false', () => {
    expect(detectValueKind({ attributeId: 'a', booleanValue: false })).toBe(AttributeType.BOOLEAN);
    expect(detectValueKind({ attributeId: 'a', numberValue: '1.5' })).toBe(AttributeType.NUMBER);
    expect(() => detectValueKind({ attributeId: 'a' })).toThrow(AppError);
    expect(() => detectValueKind({ attributeId: 'a', numberValue: '1', textValue: 'x' })).toThrow(AppError);
  });

  it('rejects a value kind that does not match the attribute', () => {
    expect(() => assertKindMatches(AttributeType.NUMBER, AttributeType.OPTION, 'energy')).toThrow(AppError);
  });

  it('stores numeric rules as exact strings and enforces min, max, and step', () => {
    expect(parseAttributeValidation(AttributeType.NUMBER, { min: '1000', max: 50000, step: '0.5' })).toEqual({
      min: '1000',
      max: '50000',
      step: '0.5',
    });
    expect(parseAttributeValidation(AttributeType.OPTION, {})).toBe(Prisma.DbNull);
    expect(() => parseAttributeValidation(AttributeType.NUMBER, { min: '9', max: '1' })).toThrow(AppError);
    expect(() => parseAttributeValidation(AttributeType.OPTION, { min: '1' })).toThrow(AppError);
    expect(() => parseAttributeValidation(AttributeType.TEXT, { pattern: '(' })).toThrow(AppError);

    const rules = { min: '0', max: '10', step: '0.5' };
    expect(assertNumberValue('1.5', rules, 'n').toString()).toBe('1.5');
    expect(() => assertNumberValue('1.25', rules, 'n')).toThrow(/step/);
    expect(() => assertNumberValue('11', rules, 'n')).toThrow(/maximum/);
  });

  it('enforces text patterns and json objects', () => {
    const rules = { pattern: '^R-.+$', maxLength: 20 };
    expect(assertTextValue('  R-410A ', rules, 'gas')).toBe('R-410A');
    expect(() => assertTextValue('410A', rules, 'gas')).toThrow(/pattern/);
    expect(assertJsonValue({ ports: ['hdmi'] }, 'ports')).toEqual({ ports: ['hdmi'] });
    expect(() => assertJsonValue('hdmi', 'ports')).toThrow(AppError);
  });
});
