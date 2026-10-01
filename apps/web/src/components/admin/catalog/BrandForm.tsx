'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { useAction } from '@/components/useAction';
import type { AdminBrand } from '@/lib/api/admin-catalog-types';
import { bff } from '@/lib/api/client';
import { optional, PATTERN, seoDraft, seoPayload, textOrNull } from './form-values';
import { SeoFields } from './SeoFields';

/** Create (no `brand`) or edit a brand. Create goes on to the edit page. */
export function BrandForm({ brand }: { brand?: AdminBrand }) {
  const router = useRouter();
  const action = useAction();
  const [name, setName] = useState(brand?.name ?? '');
  const [slug, setSlug] = useState(brand?.slug ?? '');
  const [description, setDescription] = useState(brand?.description ?? '');
  const [logoUrl, setLogoUrl] = useState(brand?.logoUrl ?? '');
  const [coverUrl, setCoverUrl] = useState(brand?.coverUrl ?? '');
  const [isActive, setIsActive] = useState(brand?.isActive ?? true);
  const [seo, setSeo] = useState(seoDraft(brand?.seo));

  const submit = async () => {
    if (brand) {
      await action.run(
        () =>
          bff(`/admin/brands/${brand.id}`, {
            method: 'PATCH',
            body: {
              name: name.trim(),
              ...optional('slug', slug),
              description: textOrNull(description),
              logoUrl: textOrNull(logoUrl),
              coverUrl: textOrNull(coverUrl),
              isActive,
              seo: seoPayload(seo),
            },
          }),
        { success: 'Brand saved.' },
      );
      return;
    }
    const seoBody = seoPayload(seo);
    const created = await action.run(
      () =>
        bff<AdminBrand>('/admin/brands', {
          method: 'POST',
          body: {
            name: name.trim(),
            ...optional('slug', slug),
            ...optional('description', description),
            ...optional('logoUrl', logoUrl),
            ...optional('coverUrl', coverUrl),
            isActive,
            ...(seoBody ? { seo: seoBody } : {}),
          },
        }),
      { refresh: false },
    );
    if (created) router.push(`/admin/brands/${created.data.id}`);
  };

  return (
    <form
      className="panel stack"
      data-testid="brand-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <FormStatus error={action.error} message={action.message} />
      <div className="form-grid">
        <div className="field">
          <label htmlFor="brand-name">Name</label>
          <input id="brand-name" required maxLength={160} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="brand-slug">
            Slug <span className="hint">{brand ? 'changing it breaks old links' : 'blank: made from the name'}</span>
          </label>
          <input
            id="brand-slug"
            pattern={PATTERN.slug}
            maxLength={80}
            title="Lowercase letters, numbers and hyphens"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="brand-logo">Logo URL</label>
          <input id="brand-logo" type="url" maxLength={2000} value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" />
        </div>
        <div className="field">
          <label htmlFor="brand-cover">Cover image URL</label>
          <input id="brand-cover" type="url" maxLength={2000} value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="https://…" />
        </div>
        <div className="field wide">
          <label htmlFor="brand-description">Description</label>
          <textarea
            id="brand-description"
            maxLength={5000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <label className="check wide" htmlFor="brand-active">
          <input id="brand-active" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active (shown on the storefront)
        </label>
        <SeoFields idPrefix="brand" value={seo} onChange={setSeo} />
      </div>
      <div>
        <button type="submit" disabled={action.pending}>
          {brand ? 'Save brand' : 'Create brand'}
        </button>
      </div>
    </form>
  );
}
