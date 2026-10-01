import type { Coupon } from '@/lib/api/admin-ops-types';
import { pkr } from '@/lib/format';

/** "10% off, up to Rs 5,000" style summary of what a coupon is worth. */
export function couponValue(coupon: Coupon): string {
  if (coupon.type === 'FREE_SHIPPING') return 'Free delivery';
  if (coupon.type === 'FIXED') return `${pkr(coupon.value)} off`;
  const percent = `${coupon.value?.replace(/\.00$/, '') ?? '0'}% off`;
  return coupon.maxDiscount ? `${percent}, up to ${pkr(coupon.maxDiscount)}` : percent;
}

const SCOPE = { CATEGORY: ['category', 'categories'], BRAND: ['brand', 'brands'], PRODUCT: ['product', 'products'] };

export function couponScope(coupon: Coupon): string {
  if (coupon.appliesTo === 'ALL') return 'Whole order';
  const count = coupon.appliesIds.length;
  const [one, many] = SCOPE[coupon.appliesTo];
  return `${count} ${count === 1 ? one : many}`;
}
