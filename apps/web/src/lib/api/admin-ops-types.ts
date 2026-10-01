/**
 * Response shapes of the operations admin API (inventory, promotions, reviews,
 * content, reporting, admin users, audit, outbox). Mirrors the serializers in
 * apps/api. Money is a 2-dp string: never parse it to a float.
 */
import type { AdminRole } from '../admin';
import type { Seo } from './types';

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  address: string;
  city: string;
  phone: string | null;
  isActive: boolean;
}

export interface StockRow {
  variantId: string;
  sku: string;
  productName: string;
  warehouse: { id: string; code: string; isActive: boolean };
  onHand: number;
  reserved: number;
  available: number;
  isAvailableOnOrder: boolean;
}

export type StockMovementType =
  | 'RECEIPT'
  | 'SALE'
  | 'RESERVATION'
  | 'RESERVATION_RELEASE'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT';

export interface LedgerEntry {
  id: string;
  variantId: string;
  warehouseId: string;
  /** Always positive; the type says which way it moved. */
  quantity: number;
  type: StockMovementType;
  refType: string | null;
  refId: string | null;
  note: string | null;
  actorId: string | null;
  createdAt: string;
}

export type CouponType = 'FIXED' | 'PERCENT' | 'FREE_SHIPPING';
export type CouponApplies = 'ALL' | 'CATEGORY' | 'BRAND' | 'PRODUCT';

export interface Coupon {
  id: string;
  code: string;
  type: CouponType;
  value: string | null;
  maxDiscount: string | null;
  minOrderValue: string | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  appliesTo: CouponApplies;
  appliesIds: string[];
  validFrom: string;
  validTo: string | null;
  isActive: boolean;
  timesUsed: number;
  /** Only filled by the single-coupon read; the list leaves it null. */
  totalDiscount: string | null;
}

export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface AdminReview {
  id: string;
  status: ReviewStatus;
  rating: number;
  title: string | null;
  body: string | null;
  isVerifiedPurchase: boolean;
  product: { slug: string; name: string };
  customerId: string;
  createdAt: string;
}

export interface AdminContentPage {
  id: string;
  slug: string;
  title: string;
  body: string;
  seo: Seo | null;
  isPublished: boolean;
  publishedAt: string | null;
  updatedAt: string;
}

export interface AdminBanner {
  id: string;
  title: string | null;
  imageUrl: string;
  linkUrl: string | null;
  position: string;
  sortOrder: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

export interface SalesRow {
  date: string;
  orders: number;
  itemsTotal: string;
  discountTotal: string;
  deliveryFee: string;
  taxTotal: string;
  grandTotal: string;
}

export interface TopProductRow {
  sku: string;
  productName: string;
  quantity: number;
  revenue: string;
}

export interface LowStockRow {
  sku: string;
  productName: string;
  warehouse: string;
  onHand: number;
  reserved: number;
  available: number;
}

export interface CodOutstandingRow {
  refNumber: string;
  status: string;
  phone: string | null;
  amount: string;
  placedAt: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  actorType: 'ADMIN' | 'CUSTOMER' | 'SYSTEM';
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  at: string;
}

export interface OutboxSummary {
  pending: number;
  published: number;
  failed: number;
  oldestPendingAt: string | null;
}

export interface DrainResult {
  claimed: number;
  published: number;
  failed: number;
}
