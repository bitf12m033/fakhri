import { add, money, mul, percent, sub, sum } from '@fakhri/shared';
import { AppError } from '@fakhri/shared';

/**
 * Order money, computed server-side with exact decimals (REQ-40, integrity rule 2).
 * Every total is asserted before it can reach the database.
 */
export interface PricedLine {
  variantId: string;
  sku: string;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: string;
  subtotal: string;
}

export interface OrderTotals {
  itemsTotal: string;
  discountTotal: string;
  deliveryFee: string;
  taxTotal: string;
  grandTotal: string;
}

export function priceLine(input: {
  variantId: string;
  sku: string;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: string;
}): PricedLine {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new AppError('INVALID_INPUT', 'Quantity must be a whole number of at least 1', {
      sku: input.sku,
      quantity: input.quantity,
    });
  }
  const unitPrice = money(input.unitPrice);
  if (unitPrice.isNegative()) {
    throw new AppError('INVALID_INPUT', 'Unit price must not be negative', { sku: input.sku });
  }
  return {
    ...input,
    unitPrice: unitPrice.toFixed(2),
    subtotal: mul(unitPrice, input.quantity).toFixed(2),
  };
}

export function itemsTotalOf(lines: readonly PricedLine[]): string {
  return sum(lines.map((line) => line.subtotal)).toFixed(2);
}

/**
 * items - discount + delivery + tax, with the invariants from the design doc:
 * a discount never exceeds the items total and no total is ever negative.
 */
export function computeTotals(input: {
  itemsTotal: string;
  discountTotal?: string;
  deliveryFee: string;
  taxRatePercent?: number;
}): OrderTotals {
  const itemsTotal = money(input.itemsTotal);
  const discountTotal = money(input.discountTotal ?? 0);
  const deliveryFee = money(input.deliveryFee);

  if (itemsTotal.isNegative() || discountTotal.isNegative() || deliveryFee.isNegative()) {
    throw new AppError('INTERNAL', 'Order totals must not be negative');
  }
  if (discountTotal.comparedTo(itemsTotal) > 0) {
    throw new AppError('INTERNAL', 'Discount cannot exceed the items total', {
      itemsTotal: itemsTotal.toFixed(2),
      discountTotal: discountTotal.toFixed(2),
    });
  }

  const taxable = sub(itemsTotal, discountTotal);
  const taxTotal = money(percent(taxable, input.taxRatePercent ?? 0));
  const grandTotal = add(add(taxable, deliveryFee), taxTotal);

  const expected = add(add(sub(itemsTotal, discountTotal), deliveryFee), taxTotal);
  if (grandTotal.comparedTo(expected) !== 0 || grandTotal.isNegative()) {
    throw new AppError('INTERNAL', 'Order total failed its consistency check');
  }

  return {
    itemsTotal: itemsTotal.toFixed(2),
    discountTotal: discountTotal.toFixed(2),
    deliveryFee: deliveryFee.toFixed(2),
    taxTotal: taxTotal.toFixed(2),
    grandTotal: grandTotal.toFixed(2),
  };
}
