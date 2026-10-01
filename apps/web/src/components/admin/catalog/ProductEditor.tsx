'use client';

import { useState } from 'react';
import type { AdminProduct, Ref, TemplateBinding } from '@/lib/api/admin-catalog-types';
import { AttributeValuesEditor } from './AttributeValuesEditor';
import type { FlatCategory } from './form-values';
import { ImagesEditor } from './ImagesEditor';
import { ProductCoreForm } from './ProductCoreForm';
import { VariantsEditor } from './VariantsEditor';

/** The product edit screen; owns the chosen category so the attribute editor follows it before it is saved. */
export function ProductEditor({
  product,
  brands,
  categories,
  template,
}: {
  product: AdminProduct;
  brands: (Ref & { isActive: boolean })[];
  categories: FlatCategory[];
  template: TemplateBinding[];
}) {
  const [categoryId, setCategoryId] = useState(product.category.id);

  return (
    <div className="stack">
      <div className="two-col">
        <ProductCoreForm
          product={product}
          brands={brands}
          categories={categories}
          categoryId={categoryId}
          onCategoryChange={setCategoryId}
        />
        <AttributeValuesEditor
          productId={product.id}
          productStatus={product.status}
          savedCategoryId={product.category.id}
          categoryId={categoryId}
          initialTemplate={template}
          values={product.attributeValues}
        />
      </div>
      <VariantsEditor productId={product.id} variants={product.variants} />
      <ImagesEditor productId={product.id} images={product.images} variants={product.variants} />
    </div>
  );
}
