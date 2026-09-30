import { DeliveryType } from '@fakhri/prisma';
import { add, money, mul, invalidInput } from '@fakhri/shared';

/**
 * Delivery fee rule table (REQ-20): zone by province, then weight bands. Kept in
 * code rather than a table because the rows are few and change with negotiated
 * courier rates, not per tenant; move it to the database when ops need to edit it.
 */
export interface DeliveryZone {
  code: 'A' | 'B' | 'C';
  provinces: readonly string[];
  /** Covers everything up to the first band. */
  base: string;
  perExtraBand: string;
}

export const FIRST_BAND_KG = 10;

export const DELIVERY_ZONES: readonly DeliveryZone[] = [
  {
    code: 'A',
    provinces: ['punjab', 'sindh', 'islamabad', 'islamabad capital territory', 'ict'],
    base: '350',
    perExtraBand: '150',
  },
  {
    code: 'B',
    provinces: ['khyber pakhtunkhwa', 'kpk', 'kp', 'balochistan'],
    base: '550',
    perExtraBand: '250',
  },
  {
    code: 'C',
    provinces: ['gilgit-baltistan', 'gilgit baltistan', 'azad jammu and kashmir', 'ajk', 'kashmir'],
    base: '850',
    perExtraBand: '400',
  },
];

export const SUPPORTED_PROVINCES = DELIVERY_ZONES.flatMap((zone) => zone.provinces);

export interface DeliveryQuote {
  deliveryType: DeliveryType;
  zone: DeliveryZone['code'] | null;
  weightKg: string;
  bands: number;
  fee: string;
}

/**
 * An unknown province is rejected rather than defaulted: silently charging the
 * most expensive zone overcharges the customer, and the cheapest one loses money.
 * The storefront offers a province list, so this only fires on bad input.
 */
export function quoteDelivery(input: {
  deliveryType: DeliveryType;
  province?: string | null;
  weightKg?: string | number | null;
}): DeliveryQuote {
  const weightKg = money(input.weightKg ?? 0).toFixed(2);

  if (input.deliveryType === DeliveryType.STORE_PICKUP) {
    return { deliveryType: input.deliveryType, zone: null, weightKg, bands: 0, fee: '0.00' };
  }

  const province = (input.province ?? '').trim().toLowerCase();
  const zone = DELIVERY_ZONES.find((candidate) => candidate.provinces.includes(province));
  if (!zone) {
    throw invalidInput('We do not deliver to that province yet', {
      province: input.province ?? null,
      supported: SUPPORTED_PROVINCES,
    });
  }

  const overweight = Math.max(0, Number(weightKg) - FIRST_BAND_KG);
  const bands = Math.ceil(overweight / FIRST_BAND_KG);
  const fee = add(zone.base, mul(zone.perExtraBand, bands));
  return { deliveryType: input.deliveryType, zone: zone.code, weightKg, bands, fee: fee.toFixed(2) };
}
