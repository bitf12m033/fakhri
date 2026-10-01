/**
 * Admin catalog response shapes (apps/api modules/catalog). Money and decimals
 * arrive as strings and stay strings (DEC-05).
 */

export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export const PRODUCT_STATUSES: ProductStatus[] = ['DRAFT', 'ACTIVE', 'ARCHIVED'];

export type AttributeType = 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'OPTION' | 'JSON';
export const ATTRIBUTE_TYPES: AttributeType[] = ['TEXT', 'NUMBER', 'BOOLEAN', 'OPTION', 'JSON'];

export interface Seo {
  title?: string;
  description?: string;
  keywords?: string[];
}

export interface Ref {
  id: string;
  slug: string;
  name: string;
}

export interface AdminProductRow {
  id: string;
  slug: string;
  name: string;
  status: ProductStatus;
  isFeatured: boolean;
  brand: Ref;
  category: Ref;
  fromPrice: string | null;
  variantCount: number;
  imageCount: number;
  publishedAt: string | null;
  updatedAt: string;
}

export interface AttributeValue {
  id: string;
  attributeId: string;
  attribute: { id: string; slug: string; name: string; type: AttributeType; unit: string | null };
  optionValueId: string | null;
  option: { id: string; value: string; label: string } | null;
  numberValue: string | null;
  booleanValue: boolean | null;
  textValue: string | null;
  jsonValue: unknown;
}

export interface AdminVariant {
  id: string;
  sku: string;
  barcode: string | null;
  name: string | null;
  price: string | null;
  compareAtPrice: string | null;
  costPrice: string | null;
  weightKg: string | null;
  heightCm: string | null;
  widthCm: string | null;
  depthCm: string | null;
  isActive: boolean;
  isAvailableOnOrder: boolean;
  attributeValues: AttributeValue[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminImage {
  id: string;
  variantId: string | null;
  url: string;
  alt: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

export interface AdminProduct {
  id: string;
  slug: string;
  name: string;
  brand: Ref;
  category: Ref;
  shortDescription: string | null;
  description: string | null;
  warrantyInfo: string | null;
  tags: string[];
  status: ProductStatus;
  isFeatured: boolean;
  publishedAt: string | null;
  seo: Seo | null;
  attributeValues: AttributeValue[];
  variants: AdminVariant[];
  images: AdminImage[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminCategory {
  id: string;
  parentId: string | null;
  slug: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  seo: Seo | null;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryNode extends AdminCategory {
  children: CategoryNode[];
}

export interface AttributeOption {
  id: string;
  value: string;
  label: string;
  sortOrder: number;
}

/** A binding row: from GET /categories/:id/attributes or the effective attribute-template. */
export interface TemplateBinding {
  attributeId: string;
  sourceCategoryId: string;
  inherited: boolean;
  group: string | null;
  sortOrder: number;
  isRequired: boolean;
  isFilterable: boolean;
  isComparable: boolean;
  attribute: {
    id: string;
    slug: string;
    name: string;
    type: AttributeType;
    unit: string | null;
    description: string | null;
    options: AttributeOption[];
  };
}

export interface AdminBrand {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  isActive: boolean;
  seo: Seo | null;
  createdAt: string;
  updatedAt: string;
}

/** NUMBER rules are decimal strings (or integers); TEXT rules are pattern/maxLength. */
export interface AttributeValidation {
  min?: string | number;
  max?: string | number;
  step?: string | number;
  pattern?: string;
  maxLength?: number;
}

export interface AdminAttributeRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: AttributeType;
  unit: string | null;
  validation: AttributeValidation | null;
  isSearchable: boolean;
  isComparable: boolean;
  createdAt: string;
  updatedAt: string;
  optionCount: number;
}

export interface AdminAttribute extends Omit<AdminAttributeRow, 'optionCount'> {
  options: AttributeOption[];
}
