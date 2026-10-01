'use client';

import { useEffect, useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { useAction } from '@/components/useAction';
import type { AdminImage, AdminVariant } from '@/lib/api/admin-catalog-types';
import { bff } from '@/lib/api/client';
import { safeHref } from '@/lib/format';
import { optional } from './form-values';

interface Draft {
  url: string;
  alt: string;
  sortOrder: string;
  isPrimary: boolean;
  variantId: string;
}

const EMPTY: Draft = { url: '', alt: '', sortOrder: '0', isPrimary: false, variantId: '' };

function ImageFields({
  idPrefix,
  draft,
  variants,
  onChange,
}: {
  idPrefix: string;
  draft: Draft;
  variants: AdminVariant[];
  onChange: (d: Draft) => void;
}) {
  return (
    <div className="form-grid">
      <div className="field wide">
        <label htmlFor={`${idPrefix}-url`}>Image URL</label>
        <input
          id={`${idPrefix}-url`}
          type="url"
          required
          maxLength={2000}
          placeholder="https://…"
          value={draft.url}
          onChange={(e) => onChange({ ...draft, url: e.target.value })}
        />
      </div>
      <div className="field wide">
        <label htmlFor={`${idPrefix}-alt`}>
          Alt text <span className="hint">describe the picture for screen readers</span>
        </label>
        <input
          id={`${idPrefix}-alt`}
          maxLength={200}
          value={draft.alt}
          onChange={(e) => onChange({ ...draft, alt: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-sort`}>Sort order</label>
        <input
          id={`${idPrefix}-sort`}
          type="number"
          min={0}
          max={1000}
          value={draft.sortOrder}
          onChange={(e) => onChange({ ...draft, sortOrder: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-variant`}>Shows for</label>
        <select
          id={`${idPrefix}-variant`}
          value={draft.variantId}
          onChange={(e) => onChange({ ...draft, variantId: e.target.value })}
        >
          <option value="">All variants</option>
          {variants.map((variant) => (
            <option key={variant.id} value={variant.id}>
              {variant.sku}
              {variant.name ? ` · ${variant.name}` : ''}
            </option>
          ))}
        </select>
      </div>
      <label className="check wide" htmlFor={`${idPrefix}-primary`}>
        <input
          id={`${idPrefix}-primary`}
          type="checkbox"
          checked={draft.isPrimary}
          onChange={(e) => onChange({ ...draft, isPrimary: e.target.checked })}
        />
        Primary image (replaces the current one)
      </label>
    </div>
  );
}

function Thumb({ url, alt }: { url: string; alt: string }) {
  const src = safeHref(url);
  if (!src) return <span className="muted small">No preview</span>;
  return <img src={src} alt={alt} style={{ width: 96, height: 96, objectFit: 'contain', background: '#f4f6f8' }} />;
}

function ImageRow({ productId, image, variants }: { productId: string; image: AdminImage; variants: AdminVariant[] }) {
  const action = useAction();
  const [draft, setDraft] = useState<Draft>({
    url: image.url,
    alt: image.alt ?? '',
    sortOrder: String(image.sortOrder),
    isPrimary: image.isPrimary,
    variantId: image.variantId ?? '',
  });
  const path = `/admin/products/${productId}/images/${image.id}`;

  // Making another image primary clears this one's flag server-side; follow it.
  useEffect(() => {
    setDraft((current) => ({ ...current, isPrimary: image.isPrimary }));
  }, [image.isPrimary]);

  return (
    <form
      className="panel stack"
      onSubmit={(e) => {
        e.preventDefault();
        void action.run(
          () =>
            bff(path, {
              method: 'PATCH',
              body: {
                url: draft.url.trim(),
                alt: draft.alt.trim() || null,
                sortOrder: Number.parseInt(draft.sortOrder, 10) || 0,
                isPrimary: draft.isPrimary,
                variantId: draft.variantId || null,
              },
            }),
          { success: 'Image saved.' },
        );
      }}
    >
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Thumb url={image.url} alt={image.alt ?? ''} />
        {image.isPrimary ? <span className="pill ok">Primary</span> : null}
      </div>
      <FormStatus error={action.error} message={action.message} />
      <ImageFields idPrefix={`image-${image.id}`} draft={draft} variants={variants} onChange={setDraft} />
      <div className="row">
        <button type="submit" disabled={action.pending}>
          Save image
        </button>
        <button
          type="button"
          className="danger"
          disabled={action.pending}
          onClick={() =>
            window.confirm('Delete this image?') && void action.run(() => bff(path, { method: 'DELETE' }))
          }
        >
          Delete image
        </button>
      </div>
    </form>
  );
}

/** Product images by URL (uploads are out of scope): edit, add, delete. */
export function ImagesEditor({
  productId,
  images,
  variants,
}: {
  productId: string;
  images: AdminImage[];
  variants: AdminVariant[];
}) {
  const action = useAction();
  const [draft, setDraft] = useState<Draft>(EMPTY);

  const create = async () => {
    const created = await action.run(
      () =>
        bff(`/admin/products/${productId}/images`, {
          method: 'POST',
          body: {
            url: draft.url.trim(),
            ...optional('alt', draft.alt),
            sortOrder: Number.parseInt(draft.sortOrder, 10) || 0,
            isPrimary: draft.isPrimary,
            ...optional('variantId', draft.variantId),
          },
        }),
      { success: 'Image added.' },
    );
    if (created) setDraft(EMPTY);
  };

  return (
    <section className="stack" aria-labelledby="images-heading" data-testid="product-images">
      <h2 id="images-heading">Images ({images.length})</h2>
      {images.length === 0 ? <p className="muted">No images yet.</p> : null}
      {images.map((image) => (
        <ImageRow key={image.id} productId={productId} image={image} variants={variants} />
      ))}
      <form
        className="panel stack"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <h3>Add image</h3>
        <FormStatus error={action.error} message={action.message} />
        <ImageFields idPrefix="image-new" draft={draft} variants={variants} onChange={setDraft} />
        <div>
          <button type="submit" className="secondary" disabled={action.pending}>
            Add image
          </button>
        </div>
      </form>
    </section>
  );
}
