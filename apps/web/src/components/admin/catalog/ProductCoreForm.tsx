'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { useAction } from '@/components/useAction';
import { PRODUCT_STATUSES, type AdminProduct, type ProductStatus, type Ref } from '@/lib/api/admin-catalog-types';
import { bff } from '@/lib/api/client';
import {
  FlatCategory,
  indentLabel,
  optional,
  PATTERN,
  seoDraft,
  seoPayload,
  splitList,
  STATUS_LABEL,
  textOrNull,
} from './form-values';
import { SeoFields } from './SeoFields';

/**
 * A product's own fields. On create it can also take a first variant (SKU and
 * price), since an ACTIVE product needs one; create goes on to the edit page.
 * On edit the category is controlled by the parent so the attribute editor can
 * follow an unsaved category change.
 */
export function ProductCoreForm({
  product,
  brands,
  categories,
  categoryId: controlledCategory,
  onCategoryChange,
}: {
  product?: AdminProduct;
  brands: (Ref & { isActive: boolean })[];
  categories: FlatCategory[];
  categoryId?: string;
  onCategoryChange?: (id: string) => void;
}) {
  const router = useRouter();
  const action = useAction();
  const [name, setName] = useState(product?.name ?? '');
  const [slug, setSlug] = useState(product?.slug ?? '');
  const [brandId, setBrandId] = useState(product?.brand.id ?? '');
  const [status, setStatus] = useState<ProductStatus>(product?.status ?? 'DRAFT');
  const [isFeatured, setIsFeatured] = useState(product?.isFeatured ?? false);
  const [shortDescription, setShortDescription] = useState(product?.shortDescription ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [warrantyInfo, setWarrantyInfo] = useState(product?.warrantyInfo ?? '');
  const [tags, setTags] = useState((product?.tags ?? []).join(', '));
  const [seo, setSeo] = useState(seoDraft(product?.seo));
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState('');
  const [ownCategory, setOwnCategory] = useState(product?.category.id ?? '');
  const categoryId = controlledCategory ?? ownCategory;
  const changeCategory = onCategoryChange ?? setOwnCategory;

  const submit = async () => {
    const tagList = splitList(tags);
    if (product) {
      await action.run(
        () =>
          bff(`/admin/products/${product.id}`, {
            method: 'PATCH',
            body: {
              name: name.trim(),
              ...optional('slug', slug),
              brandId,
              categoryId,
              status,
              isFeatured,
              shortDescription: textOrNull(shortDescription),
              description: textOrNull(description),
              warrantyInfo: textOrNull(warrantyInfo),
              tags: tagList,
              seo: seoPayload(seo),
            },
          }),
        { success: 'Product saved.' },
      );
      return;
    }
    const seoBody = seoPayload(seo);
    const created = await action.run(
      () =>
        bff<AdminProduct>('/admin/products', {
          method: 'POST',
          body: {
            name: name.trim(),
            ...optional('slug', slug),
            brandId,
            categoryId,
            status,
            isFeatured,
            ...optional('shortDescription', shortDescription),
            ...optional('description', description),
            ...optional('warrantyInfo', warrantyInfo),
            ...(tagList.length > 0 ? { tags: tagList } : {}),
            ...(seoBody ? { seo: seoBody } : {}),
            ...(sku.trim() ? { variants: [{ sku: sku.trim(), price: price.trim() }] } : {}),
          },
        }),
      { refresh: false },
    );
    if (created) router.push(`/admin/products/${created.data.id}`);
  };

  const categoryChanged = product && categoryId !== product.category.id;

  return (
    <form
      className="panel stack"
      data-testid="product-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2>Details</h2>
      <FormStatus error={action.error} message={action.message} />
      <div className="form-grid">
        <div className="field wide">
          <label htmlFor="product-name">Name</label>
          <input id="product-name" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="product-slug">
            Slug <span className="hint">{product ? 'changing it breaks old links' : 'blank: made from the name'}</span>
          </label>
          <input
            id="product-slug"
            pattern={PATTERN.slug}
            maxLength={80}
            title="Lowercase letters, numbers and hyphens"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="product-status">Status</label>
          <select id="product-status" value={status} onChange={(e) => setStatus(e.target.value as ProductStatus)}>
            {PRODUCT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABEL[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="product-brand">Brand</label>
          <select id="product-brand" required value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            <option value="">Choose…</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
                {brand.isActive ? '' : ' (inactive)'}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="product-category">
            Category{categoryChanged ? <span className="hint"> unsaved: attributes below follow it</span> : null}
          </label>
          <select id="product-category" required value={categoryId} onChange={(e) => changeCategory(e.target.value)}>
            <option value="">Choose…</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {indentLabel(category)}
              </option>
            ))}
          </select>
        </div>
        <label className="check wide" htmlFor="product-featured">
          <input
            id="product-featured"
            type="checkbox"
            checked={isFeatured}
            onChange={(e) => setIsFeatured(e.target.checked)}
          />
          Featured on the home page
        </label>
        <div className="field wide">
          <label htmlFor="product-short">Short description</label>
          <input
            id="product-short"
            maxLength={500}
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
          />
        </div>
        <div className="field wide">
          <label htmlFor="product-description">Description</label>
          <textarea
            id="product-description"
            rows={6}
            maxLength={20000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="field wide">
          <label htmlFor="product-warranty">Warranty</label>
          <input
            id="product-warranty"
            maxLength={2000}
            value={warrantyInfo}
            placeholder="e.g. 1 year official warranty"
            onChange={(e) => setWarrantyInfo(e.target.value)}
          />
        </div>
        <div className="field wide">
          <label htmlFor="product-tags">
            Tags <span className="hint">comma-separated, up to 20</span>
          </label>
          <input id="product-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
        </div>
        <SeoFields idPrefix="product" value={seo} onChange={setSeo} />
        {product ? null : (
          <fieldset className="form-grid wide">
            <legend>First variant (optional, needed to go active)</legend>
            <div className="field">
              <label htmlFor="product-first-sku">SKU</label>
              <input
                id="product-first-sku"
                pattern={PATTERN.sku}
                title="Letters, numbers, dots, underscores or hyphens"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="product-first-price">Price (PKR)</label>
              <input
                id="product-first-price"
                inputMode="decimal"
                pattern={PATTERN.money}
                title="An amount with up to 2 decimal places"
                required={Boolean(sku.trim())}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          </fieldset>
        )}
      </div>
      {categoryChanged && product.status === 'ACTIVE' ? (
        <p className="small muted" style={{ margin: 0 }}>
          This product is live, so the new category&apos;s required attributes must be saved before the move.
        </p>
      ) : null}
      <div>
        <button type="submit" disabled={action.pending}>
          {product ? 'Save details' : 'Create product'}
        </button>
      </div>
    </form>
  );
}
