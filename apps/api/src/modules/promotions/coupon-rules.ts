import { CouponApplies, CouponType } from '@fakhri/prisma';
import { AppError, add, money, mul, percent, sum } from '@fakhri/shared';

/** The coupon fields the rules need, as plain strings so they stay pure. */
export interface CouponTerms {
  code: string;
  type: CouponType;
  value: string;
  maxDiscount: string | null;
  minOrderValue: string | null;
  validFrom: Date;
  validTo: Date | null;
  isActive: boolean;
  appliesTo: CouponApplies;
  /** Category ids already expanded to include descendants, or brand/product ids. */
  appliesIds: readonly string[];
}

export interface CouponLine {
  productId: string;
  categoryId: string;
  brandId: string;
  subtotal: string;
}

export interface CouponOutcome {
  code: string;
  type: CouponType;
  /** Amount off the items total. Zero for a free-shipping coupon. */
  discount: string;
  /** True when the coupon waives the delivery fee instead. */
  freeShipping: boolean;
  /** The part of the cart the coupon applied to. */
  eligibleSubtotal: string;
}

const invalid = (message: string, details?: unknown): AppError =>
  new AppError('COUPON_INVALID', message, details);

/**
 * Coupon evaluation (REQ-22). Pure, so the cart preview and the checkout
 * transaction cannot disagree about what a code is worth.
 */
export function evaluateCoupon(
  terms: CouponTerms,
  lines: readonly CouponLine[],
  options: { now?: Date } = {},
): CouponOutcome {
  const now = options.now ?? new Date();
  if (!terms.isActive) throw invalid('This coupon is no longer available', { code: terms.code });
  if (now < terms.validFrom) throw invalid('This coupon is not active yet', { validFrom: terms.validFrom });
  if (terms.validTo && now > terms.validTo) throw invalid('This coupon has expired', { validTo: terms.validTo });

  const itemsTotal = sum(lines.map((line) => line.subtotal));
  if (terms.minOrderValue && itemsTotal.comparedTo(terms.minOrderValue) < 0) {
    throw invalid(`This coupon needs an order of at least ${money(terms.minOrderValue).toFixed(2)}`, {
      minOrderValue: money(terms.minOrderValue).toFixed(2),
      itemsTotal: itemsTotal.toFixed(2),
    });
  }

  const eligible = lines.filter((line) => applies(terms, line));
  if (eligible.length === 0) {
    throw invalid('This coupon does not apply to anything in your cart', { code: terms.code });
  }
  const eligibleSubtotal = sum(eligible.map((line) => line.subtotal));

  if (terms.type === CouponType.FREE_SHIPPING) {
    return {
      code: terms.code,
      type: terms.type,
      discount: '0.00',
      freeShipping: true,
      eligibleSubtotal: eligibleSubtotal.toFixed(2),
    };
  }

  const raw =
    terms.type === CouponType.PERCENT
      ? percent(eligibleSubtotal, terms.value)
      : money(terms.value);
  const capped = terms.maxDiscount && raw.comparedTo(terms.maxDiscount) > 0 ? money(terms.maxDiscount) : raw;
  // A discount never exceeds what it applies to, so a total can never go negative.
  const discount = capped.comparedTo(eligibleSubtotal) > 0 ? eligibleSubtotal : capped;

  return {
    code: terms.code,
    type: terms.type,
    discount: discount.toFixed(2),
    freeShipping: false,
    eligibleSubtotal: eligibleSubtotal.toFixed(2),
  };
}

function applies(terms: CouponTerms, line: CouponLine): boolean {
  switch (terms.appliesTo) {
    case CouponApplies.ALL:
      return true;
    case CouponApplies.PRODUCT:
      return terms.appliesIds.includes(line.productId);
    case CouponApplies.CATEGORY:
      return terms.appliesIds.includes(line.categoryId);
    case CouponApplies.BRAND:
      return terms.appliesIds.includes(line.brandId);
    default:
      return false;
  }
}

/** Redemption caps (REQ-22). Counts come from CouponUsage under a row lock. */
export function assertRedemptionAllowed(
  terms: { code: string; usageLimit: number | null; perCustomerLimit: number | null },
  counts: { total: number; forCustomer: number },
): void {
  if (terms.usageLimit !== null && counts.total >= terms.usageLimit) {
    throw new AppError('COUPON_LIMIT', 'This coupon has been fully redeemed', { code: terms.code });
  }
  if (terms.perCustomerLimit !== null && counts.forCustomer >= terms.perCustomerLimit) {
    throw new AppError('COUPON_LIMIT', 'You have already used this coupon', {
      code: terms.code,
      limit: terms.perCustomerLimit,
    });
  }
}

/** Normalized for storage and lookup: codes are case-insensitive to shoppers. */
export function normalizeCouponCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{2,31}$/.test(normalized)) {
    throw new AppError('COUPON_INVALID', 'That coupon code is not valid', { code });
  }
  return normalized;
}

/** Totals helper shared by the cart preview: items - discount, never below zero. */
export function netOfDiscount(itemsTotal: string, discount: string): string {
  const net = add(itemsTotal, mul(discount, -1));
  return net.isNegative() ? '0.00' : net.toFixed(2);
}
