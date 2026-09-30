import { describe, expect, it } from 'vitest';
import { CouponApplies, CouponType } from '@fakhri/prisma';
import { AppError } from '@fakhri/shared';
import {
  assertRedemptionAllowed,
  CouponLine,
  CouponTerms,
  evaluateCoupon,
  netOfDiscount,
  normalizeCouponCode,
} from '../src/modules/promotions/coupon-rules';
import { escapeCsv, toCsv } from '../src/modules/reporting/csv';

/** Coupon arithmetic and CSV escaping (increment 3.7). No database needed. */

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof AppError ? error.code : 'NOT_APP_ERROR';
  }
  return 'NO_ERROR';
}

const terms = (overrides: Partial<CouponTerms> = {}): CouponTerms => ({
  code: 'SAVE500',
  type: CouponType.FIXED,
  value: '500.00',
  maxDiscount: null,
  minOrderValue: null,
  validFrom: new Date('2026-01-01T00:00:00Z'),
  validTo: null,
  isActive: true,
  appliesTo: CouponApplies.ALL,
  appliesIds: [],
  ...overrides,
});

const lines: CouponLine[] = [
  { productId: 'p1', categoryId: 'c1', brandId: 'b1', subtotal: '10000.00' },
  { productId: 'p2', categoryId: 'c2', brandId: 'b2', subtotal: '5000.00' },
];

describe('coupon evaluation (REQ-22)', () => {
  it('takes a fixed amount off, never more than the cart holds', () => {
    expect(evaluateCoupon(terms(), lines)).toMatchObject({ discount: '500.00', eligibleSubtotal: '15000.00' });
    expect(evaluateCoupon(terms({ value: '99999.00' }), lines).discount).toBe('15000.00');
  });

  it('takes a percentage of the eligible subtotal and respects the cap', () => {
    expect(evaluateCoupon(terms({ type: CouponType.PERCENT, value: '10' }), lines).discount).toBe('1500.00');
    expect(
      evaluateCoupon(terms({ type: CouponType.PERCENT, value: '10', maxDiscount: '900.00' }), lines).discount,
    ).toBe('900.00');
    // Rounds half-up to two places, exactly like every other amount.
    expect(
      evaluateCoupon(terms({ type: CouponType.PERCENT, value: '7.5' }), [
        { productId: 'p1', categoryId: 'c1', brandId: 'b1', subtotal: '333.33' },
      ]).discount,
    ).toBe('25.00');
  });

  it('waives shipping instead of discounting items', () => {
    const outcome = evaluateCoupon(terms({ type: CouponType.FREE_SHIPPING, value: '0' }), lines);
    expect(outcome).toMatchObject({ discount: '0.00', freeShipping: true });
  });

  it('applies only to the matching part of the cart', () => {
    const byProduct = evaluateCoupon(
      terms({ type: CouponType.PERCENT, value: '10', appliesTo: CouponApplies.PRODUCT, appliesIds: ['p2'] }),
      lines,
    );
    expect(byProduct).toMatchObject({ eligibleSubtotal: '5000.00', discount: '500.00' });

    const byBrand = evaluateCoupon(
      terms({ appliesTo: CouponApplies.BRAND, appliesIds: ['b1'] }),
      lines,
    );
    expect(byBrand.eligibleSubtotal).toBe('10000.00');

    const byCategory = evaluateCoupon(
      terms({ appliesTo: CouponApplies.CATEGORY, appliesIds: ['c1', 'c2'] }),
      lines,
    );
    expect(byCategory.eligibleSubtotal).toBe('15000.00');
  });

  it('refuses a coupon that is inactive, early, expired, under the minimum or irrelevant', () => {
    expect(code(() => evaluateCoupon(terms({ isActive: false }), lines))).toBe('COUPON_INVALID');
    expect(code(() => evaluateCoupon(terms({ validFrom: new Date('2099-01-01') }), lines))).toBe('COUPON_INVALID');
    expect(code(() => evaluateCoupon(terms({ validTo: new Date('2026-01-02') }), lines))).toBe('COUPON_INVALID');
    expect(code(() => evaluateCoupon(terms({ minOrderValue: '20000.00' }), lines))).toBe('COUPON_INVALID');
    expect(
      code(() => evaluateCoupon(terms({ appliesTo: CouponApplies.PRODUCT, appliesIds: ['nope'] }), lines)),
    ).toBe('COUPON_INVALID');
  });

  it('accepts a cart exactly on the minimum', () => {
    expect(code(() => evaluateCoupon(terms({ minOrderValue: '15000.00' }), lines))).toBe('NO_ERROR');
  });
});

describe('redemption caps (REQ-22)', () => {
  it('treats null limits as unlimited', () => {
    expect(
      code(() => assertRedemptionAllowed({ code: 'X', usageLimit: null, perCustomerLimit: null }, { total: 999, forCustomer: 999 })),
    ).toBe('NO_ERROR');
  });

  it('stops at the global limit and at the per-customer limit', () => {
    expect(
      code(() => assertRedemptionAllowed({ code: 'X', usageLimit: 10, perCustomerLimit: null }, { total: 10, forCustomer: 0 })),
    ).toBe('COUPON_LIMIT');
    expect(
      code(() => assertRedemptionAllowed({ code: 'X', usageLimit: 10, perCustomerLimit: 1 }, { total: 3, forCustomer: 1 })),
    ).toBe('COUPON_LIMIT');
    expect(
      code(() => assertRedemptionAllowed({ code: 'X', usageLimit: 10, perCustomerLimit: 2 }, { total: 9, forCustomer: 1 })),
    ).toBe('NO_ERROR');
  });
});

describe('coupon codes and totals', () => {
  it('normalizes a code the way a shopper types it', () => {
    expect(normalizeCouponCode('  save500 ')).toBe('SAVE500');
    expect(normalizeCouponCode('eid-2026')).toBe('EID-2026');
    expect(code(() => normalizeCouponCode('ab'))).toBe('COUPON_INVALID');
    expect(code(() => normalizeCouponCode('bad code!'))).toBe('COUPON_INVALID');
    expect(code(() => normalizeCouponCode('-leading'))).toBe('COUPON_INVALID');
  });

  it('never lets a discount push a total below zero', () => {
    expect(netOfDiscount('1000.00', '250.50')).toBe('749.50');
    expect(netOfDiscount('100.00', '250.00')).toBe('0.00');
  });
});

describe('CSV export (REQ-35)', () => {
  it('quotes fields containing a comma, quote or newline', () => {
    expect(escapeCsv('plain')).toBe('plain');
    expect(escapeCsv('a,b')).toBe('"a,b"');
    expect(escapeCsv('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsv('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsv(null)).toBe('');
    expect(escapeCsv(42)).toBe('42');
  });

  it('defuses values a spreadsheet would treat as a formula', () => {
    expect(escapeCsv('=1+1')).toBe("'=1+1");
    expect(escapeCsv('+92300')).toBe("'+92300");
    expect(escapeCsv('-5')).toBe("'-5");
    expect(escapeCsv('@here')).toBe("'@here");
  });

  it('writes a header row and CRLF line endings', () => {
    const csv = toCsv(
      [{ sku: 'A-1', qty: 2 }, { sku: 'B,2', qty: 0 }],
      [
        { header: 'SKU', value: (row) => row.sku },
        { header: 'Qty', value: (row) => row.qty },
      ],
    );
    expect(csv).toBe('SKU,Qty\r\nA-1,2\r\n"B,2",0\r\n');
    expect(toCsv([], [{ header: 'SKU', value: () => '' }])).toBe('SKU\r\n');
  });
});
