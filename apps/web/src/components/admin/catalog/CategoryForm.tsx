'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { useAction } from '@/components/useAction';
import type { AdminCategory } from '@/lib/api/admin-catalog-types';
import { bff } from '@/lib/api/client';
import { FlatCategory, indentLabel, optional, PATTERN, seoDraft, seoPayload, textOrNull } from './form-values';
import { SeoFields } from './SeoFields';

/**
 * Create (no `category`) or edit a category. `parents` must already exclude the
 * category itself and its descendants, which the API would reject as a cycle.
 */
export function CategoryForm({
  category,
  parents,
  defaultParentId,
}: {
  category?: AdminCategory;
  parents: FlatCategory[];
  defaultParentId?: string;
}) {
  const router = useRouter();
  const action = useAction();
  const [name, setName] = useState(category?.name ?? '');
  const [slug, setSlug] = useState(category?.slug ?? '');
  const [parentId, setParentId] = useState(category ? (category.parentId ?? '') : (defaultParentId ?? ''));
  const [description, setDescription] = useState(category?.description ?? '');
  const [iconUrl, setIconUrl] = useState(category?.iconUrl ?? '');
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(category?.isActive ?? true);
  const [seo, setSeo] = useState(seoDraft(category?.seo));

  const submit = async () => {
    const order = Number.parseInt(sortOrder, 10);
    if (category) {
      await action.run(
        () =>
          bff(`/admin/categories/${category.id}`, {
            method: 'PATCH',
            body: {
              name: name.trim(),
              ...optional('slug', slug),
              parentId: parentId || null,
              description: textOrNull(description),
              iconUrl: textOrNull(iconUrl),
              sortOrder: Number.isNaN(order) ? 0 : order,
              isActive,
              seo: seoPayload(seo),
            },
          }),
        { success: 'Category saved.' },
      );
      return;
    }
    const seoBody = seoPayload(seo);
    const created = await action.run(
      () =>
        bff<AdminCategory>('/admin/categories', {
          method: 'POST',
          body: {
            name: name.trim(),
            ...optional('slug', slug),
            ...optional('parentId', parentId),
            ...optional('description', description),
            ...optional('iconUrl', iconUrl),
            sortOrder: Number.isNaN(order) ? 0 : order,
            isActive,
            ...(seoBody ? { seo: seoBody } : {}),
          },
        }),
      { refresh: false },
    );
    if (created) router.push(`/admin/categories/${created.data.id}`);
  };

  return (
    <form
      className="panel stack"
      data-testid="category-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <FormStatus error={action.error} message={action.message} />
      <div className="form-grid">
        <div className="field">
          <label htmlFor="category-name">Name</label>
          <input id="category-name" required maxLength={160} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="category-slug">
            Slug <span className="hint">{category ? 'changing it breaks old links' : 'blank: made from the name'}</span>
          </label>
          <input
            id="category-slug"
            pattern={PATTERN.slug}
            maxLength={80}
            title="Lowercase letters, numbers and hyphens"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="category-parent">Parent</label>
          <select id="category-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">None (top level)</option>
            {parents.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {indentLabel(parent)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="category-sort">
            Sort order <span className="hint">lower comes first</span>
          </label>
          <input
            id="category-sort"
            type="number"
            min={0}
            max={100000}
            step={1}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </div>
        <div className="field wide">
          <label htmlFor="category-icon">Icon URL</label>
          <input id="category-icon" type="url" maxLength={2000} value={iconUrl} onChange={(e) => setIconUrl(e.target.value)} placeholder="https://…" />
        </div>
        <div className="field wide">
          <label htmlFor="category-description">Description</label>
          <textarea
            id="category-description"
            maxLength={5000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <label className="check wide" htmlFor="category-active">
          <input id="category-active" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active (shown on the storefront)
        </label>
        <SeoFields idPrefix="category" value={seo} onChange={setSeo} />
      </div>
      <div>
        <button type="submit" disabled={action.pending}>
          {category ? 'Save category' : 'Create category'}
        </button>
      </div>
    </form>
  );
}
