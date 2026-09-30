import { describe, expect, it } from 'vitest';
import { AppError } from '@fakhri/shared';
import {
  parseAttributeFilters,
  parseCompareIds,
  parsePrice,
  parseSlugList,
  parseSort,
  parseTerm,
  SEARCH_LIMITS,
} from '../src/modules/search/search-query';

/** Query parsing for the public search API (increment 3.3). No database needed. */

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof AppError ? error.code : 'NOT_APP_ERROR';
  }
  return 'NO_ERROR';
}

describe('parseTerm', () => {
  it('trims and drops empty terms', () => {
    expect(parseTerm('  inverter ')).toBe('inverter');
    expect(parseTerm('   ')).toBeUndefined();
    expect(parseTerm(undefined)).toBeUndefined();
  });

  it('rejects an over-long term', () => {
    expect(code(() => parseTerm('x'.repeat(SEARCH_LIMITS.termLength + 1)))).toBe('INVALID_INPUT');
  });
});

describe('parseSort', () => {
  it('defaults to newest without a term and relevance with one', () => {
    expect(parseSort(undefined, false)).toBe('newest');
    expect(parseSort(undefined, true)).toBe('relevance');
  });

  it('falls back to newest when relevance is asked for without a term', () => {
    expect(parseSort('relevance', false)).toBe('newest');
  });

  it('keeps an explicit key and rejects an unknown one', () => {
    expect(parseSort('price_desc', true)).toBe('price_desc');
    expect(code(() => parseSort('cheapest', true))).toBe('INVALID_INPUT');
  });
});

describe('parseSlugList', () => {
  it('accepts repeated and comma-separated values, deduped', () => {
    expect(parseSlugList(['haier,dawlance', 'haier'], 'brand', 20)).toEqual(['haier', 'dawlance']);
    expect(parseSlugList('haier', 'brand', 20)).toEqual(['haier']);
    expect(parseSlugList(undefined, 'brand', 20)).toEqual([]);
  });

  it('rejects non-slug values and over-long lists', () => {
    expect(code(() => parseSlugList('Haier Inc', 'brand', 20))).toBe('INVALID_INPUT');
    expect(code(() => parseSlugList(['a', 'b', 'c'], 'brand', 2))).toBe('INVALID_INPUT');
  });
});

describe('parsePrice', () => {
  it('is undefined when neither bound is given', () => {
    expect(parsePrice(undefined, undefined)).toBeUndefined();
    expect(parsePrice('', ' ')).toBeUndefined();
  });

  it('reads one or both bounds', () => {
    expect(parsePrice('1000', undefined)).toEqual({ min: '1000' });
    expect(parsePrice(undefined, '99999.99')).toEqual({ max: '99999.99' });
    expect(parsePrice('100', '200')).toEqual({ min: '100', max: '200' });
  });

  it('rejects bad numbers and an inverted range', () => {
    expect(code(() => parsePrice('-5', undefined))).toBe('INVALID_INPUT');
    expect(code(() => parsePrice('1.234', undefined))).toBe('INVALID_INPUT');
    expect(code(() => parsePrice('300', '200'))).toBe('INVALID_INPUT');
  });
});

describe('parseAttributeFilters', () => {
  it('parses option lists, deduping values', () => {
    expect(parseAttributeFilters('energy:inverter,fixed,inverter')).toEqual([
      { slug: 'energy', values: ['inverter', 'fixed'] },
    ]);
  });

  it('parses closed and open numeric ranges', () => {
    expect(parseAttributeFilters('cooling-btu:12000..18000')).toEqual([
      { slug: 'cooling-btu', values: [], range: { min: '12000', max: '18000' } },
    ]);
    expect(parseAttributeFilters('cooling-btu:12000..')).toEqual([
      { slug: 'cooling-btu', values: [], range: { min: '12000' } },
    ]);
    expect(parseAttributeFilters('cooling-btu:..18000')).toEqual([
      { slug: 'cooling-btu', values: [], range: { max: '18000' } },
    ]);
  });

  it('keeps boolean literals as values for the service to type-check', () => {
    expect(parseAttributeFilters(['wifi:true'])).toEqual([{ slug: 'wifi', values: ['true'] }]);
  });

  it('rejects malformed filters', () => {
    expect(code(() => parseAttributeFilters('energy'))).toBe('INVALID_INPUT');
    expect(code(() => parseAttributeFilters(':inverter'))).toBe('INVALID_INPUT');
    expect(code(() => parseAttributeFilters('energy:'))).toBe('INVALID_INPUT');
    expect(code(() => parseAttributeFilters('Energy:inverter'))).toBe('INVALID_INPUT');
    expect(code(() => parseAttributeFilters(['energy:inverter', 'energy:fixed']))).toBe('INVALID_INPUT');
    expect(code(() => parseAttributeFilters('cooling-btu:18000..12000'))).toBe('INVALID_INPUT');
    expect(code(() => parseAttributeFilters('cooling-btu:abc..12000'))).toBe('INVALID_INPUT');
  });

  it('bounds how many filters and values a request may carry', () => {
    const many = Array.from({ length: SEARCH_LIMITS.attributeFilters + 1 }, (_, i) => `a${i}:x`);
    expect(code(() => parseAttributeFilters(many))).toBe('INVALID_INPUT');
    const wide = `energy:${Array.from({ length: SEARCH_LIMITS.valuesPerFilter + 1 }, (_, i) => `v${i}`).join(',')}`;
    expect(code(() => parseAttributeFilters(wide))).toBe('INVALID_INPUT');
  });
});

describe('parseCompareIds', () => {
  it('accepts 2 to 4 deduped ids', () => {
    expect(parseCompareIds('a,b')).toEqual(['a', 'b']);
    expect(parseCompareIds('a, b , a')).toEqual(['a', 'b']);
  });

  it('rejects too few or too many', () => {
    expect(code(() => parseCompareIds('a'))).toBe('INVALID_INPUT');
    expect(code(() => parseCompareIds(undefined))).toBe('INVALID_INPUT');
    expect(code(() => parseCompareIds('a,b,c,d,e'))).toBe('INVALID_INPUT');
  });
});
