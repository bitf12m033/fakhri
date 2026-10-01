/**
 * Response shapes of the public and customer API, as the storefront reads them.
 * Mirrors the serializers in apps/api (catalog/public, search, cart, orders,
 * reviews, content). Money is always a 2-dp string: never parse it to a float.
 */
import type { PaginationMeta } from '@fakhri/shared';

export type { PaginationMeta };

export interface Envelope<T, M = undefined> {
  data: T;
  meta: M;
}

export type Availability = 'IN_STOCK' | 'AVAILABLE_ON_ORDER' | 'OUT_OF_STOCK';

export interface Seo {
  title?: string;
  description?: string;
  keywords?: string[];
}

export interface CategoryNode {
  slug: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  productCount: number;
  children: CategoryNode[];
}

export interface CategoryDetail extends CategoryNode {
  seo: Seo | null;
  breadcrumb: { slug: string; name: string }[];
}

export interface BrandSummary {
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  productCount: number;
}

export interface BrandDetail extends BrandSummary {
  coverUrl: string | null;
  seo: Seo | null;
}

export interface ProductImage {
  url: string;
  alt: string | null;
  variantId: string | null;
  isPrimary: boolean;
}

export interface ProductCard {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  brand: { slug: string; name: string };
  category: { slug: string; name: string };
  image: ProductImage | null;
  fromPrice: string | null;
  toPrice: string | null;
  compareAtPrice: string | null;
  availability: Availability;
  isFeatured: boolean;
  variantCount: number;
}

export interface FacetValue {
  value: string;
  label: string;
  count: number;
}

export interface AttributeFacet {
  slug: string;
  name: string;
  type: 'OPTION' | 'NUMBER' | 'BOOLEAN' | 'TEXT' | 'JSON';
  unit: string | null;
  values: FacetValue[];
  range: { min: string; max: string } | null;
}

export type SortKey = 'relevance' | 'newest' | 'price_asc' | 'price_desc' | 'name_asc';

export interface SearchMeta extends PaginationMeta {
  sort: SortKey;
  facets: {
    brands: FacetValue[];
    categories: FacetValue[];
    price: { min: string; max: string } | null;
    attributes: AttributeFacet[];
  };
}

export interface Suggestions {
  products: { slug: string; name: string; brand: string }[];
  brands: { slug: string; name: string }[];
  categories: { slug: string; name: string }[];
}

export interface Spec {
  attributeId: string;
  slug: string;
  name: string;
  type: AttributeFacet['type'];
  unit: string | null;
  group: string | null;
  value: string | boolean | null;
  optionValue: string | null;
}

export interface ProductVariant {
  id: string;
  sku: string;
  name: string | null;
  price: string | null;
  compareAtPrice: string | null;
  availability: Availability;
  specs: Spec[];
}

export interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  brand: { id: string; slug: string; name: string; logoUrl: string | null };
  category: { slug: string; name: string };
  breadcrumb: { slug: string; name: string }[];
  shortDescription: string | null;
  description: string | null;
  warrantyInfo: string | null;
  tags: string[];
  seo: Seo | null;
  images: ProductImage[];
  specGroups: { group: string | null; specs: Spec[] }[];
  variants: ProductVariant[];
  fromPrice: string | null;
  toPrice: string | null;
  availability: Availability;
  rating: { average: string | null; count: number };
  publishedAt: string | null;
}

export interface Comparison {
  products: {
    id: string;
    slug: string;
    name: string;
    brand: { slug: string; name: string };
    image: ProductImage | null;
    fromPrice: string | null;
  }[];
  specs: {
    attributeId: string;
    slug: string;
    name: string;
    unit: string | null;
    values: { productId: string; value: string | boolean | null }[];
  }[];
}

export interface Review {
  rating: number;
  title: string | null;
  body: string | null;
  images: string[];
  isVerifiedPurchase: boolean;
  author: string;
  createdAt: string;
}

export interface ReviewsMeta extends PaginationMeta {
  summary: { average: string | null; count: number; histogram: Record<string, number> };
}

export interface CartLine {
  itemId: string;
  variantId: string;
  sku: string;
  productName: string;
  productSlug: string;
  variantName: string | null;
  quantity: number;
  unitPrice: string | null;
  currentPrice: string | null;
  priceChanged: boolean;
  subtotal: string | null;
  available: number | null;
  isAvailableOnOrder: boolean;
  inStock: boolean;
}

export interface Cart {
  id: string | null;
  itemCount: number;
  itemsTotal: string;
  discountTotal: string;
  lines: CartLine[];
  coupon: { code: string; type: string; discount: string; freeShipping: boolean } | null;
  couponIssue: string | null;
  hasPriceChanges: boolean;
  hasUnavailableLines: boolean;
}

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PACKED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURNED';

export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'PENDING_COLLECTION' | 'COLLECTED' | 'REFUNDED';

export type PaymentMethod = 'COD' | 'CARD' | 'JAZZCASH' | 'EASYPAISA' | 'BANK_TRANSFER';
export type DeliveryType = 'HOME_DELIVERY' | 'STORE_PICKUP';

export interface Order {
  refNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryType: DeliveryType;
  itemsTotal: string | null;
  discountTotal: string | null;
  deliveryFee: string | null;
  taxTotal: string | null;
  grandTotal: string | null;
  items: {
    variantId: string;
    sku: string;
    productName: string;
    variantName: string | null;
    quantity: number;
    unitPrice: string | null;
    subtotal: string | null;
  }[];
  address: Record<string, unknown> | null;
  customerNote: string | null;
  payment: { id: string; method: PaymentMethod; status: PaymentStatus; amount: string | null } | null;
  shipment: {
    carrier: string | null;
    trackingCode: string | null;
    status: string;
    events: { status: string; location: string | null; note: string | null; at: string }[];
  } | null;
  history: { status: OrderStatus; note: string | null; at: string }[];
  placedAt: string;
  updatedAt: string;
  replayed?: boolean;
}

export interface OrderSummary {
  refNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryType: DeliveryType;
  grandTotal: string | null;
  itemCount: number;
  placedAt: string;
}

export interface Customer {
  id: string;
  phone: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  isPhoneVerified: boolean;
  whatsappConsent: boolean;
  hasPassword: boolean;
  createdAt: string;
}

export interface Address {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string;
  province: string;
  city: string;
  area: string | null;
  addressLine: string;
  landmark: string | null;
  isDefault: boolean;
}

export interface WishlistItem {
  variantId: string;
  sku: string;
  price: string | null;
  addedAt: string;
  /** Null once the product is no longer publicly visible. */
  product: ProductCard | null;
}

export interface ContentPage {
  slug: string;
  title: string;
  body: string;
  seo: Seo | null;
  publishedAt: string | null;
  updatedAt: string;
}

/** Public banners carry no id: the storefront keys them by position and order. */
export interface Banner {
  title: string | null;
  imageUrl: string;
  linkUrl: string | null;
  position: string;
  sortOrder: number;
}

export interface PaymentSession {
  gateway: string;
  gatewayRef: string;
  redirectUrl: string;
  expiresAt: string;
}
