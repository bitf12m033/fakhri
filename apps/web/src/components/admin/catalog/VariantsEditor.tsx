'use client';

import { useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { StatusPill } from '@/components/ui';
import { useAction } from '@/components/useAction';
import type { AdminVariant } from '@/lib/api/admin-catalog-types';
import { bff } from '@/lib/api/client';
import { pkr } from '@/lib/format';
import { optional, PATTERN, textOrNull } from './form-values';

interface Draft {
  sku: string;
  name: string;
  barcode: string;
  price: string;
  compareAtPrice: string;
  costPrice: string;
  weightKg: string;
  isActive: boolean;
  isAvailableOnOrder: boolean;
}

const EMPTY: Draft = {
  sku: '',
  name: '',
  barcode: '',
  price: '',
  compareAtPrice: '',
  costPrice: '',
  weightKg: '',
  isActive: true,
  isAvailableOnOrder: false,
};

function draftOf(variant: AdminVariant): Draft {
  return {
    sku: variant.sku,
    name: variant.name ?? '',
    barcode: variant.barcode ?? '',
    price: variant.price ?? '',
    compareAtPrice: variant.compareAtPrice ?? '',
    costPrice: variant.costPrice ?? '',
    weightKg: variant.weightKg ?? '',
    isActive: variant.isActive,
    isAvailableOnOrder: variant.isAvailableOnOrder,
  };
}

/** Money and weights stay the strings the admin typed; the API validates and rounds them. */
function VariantFields({ idPrefix, draft, onChange }: { idPrefix: string; draft: Draft; onChange: (d: Draft) => void }) {
  const text = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...draft, [key]: e.target.value });
  return (
    <div className="form-grid">
      <div className="field">
        <label htmlFor={`${idPrefix}-sku`}>SKU</label>
        <input
          id={`${idPrefix}-sku`}
          required
          pattern={PATTERN.sku}
          title="Letters, numbers, dots, underscores or hyphens"
          value={draft.sku}
          onChange={text('sku')}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-name`}>
          Name <span className="hint">e.g. 1.5 ton, 55 inch</span>
        </label>
        <input id={`${idPrefix}-name`} maxLength={120} value={draft.name} onChange={text('name')} />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-barcode`}>Barcode</label>
        <input
          id={`${idPrefix}-barcode`}
          pattern={PATTERN.barcode}
          title="Up to 32 letters, numbers or hyphens"
          value={draft.barcode}
          onChange={text('barcode')}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-price`}>Price (PKR)</label>
        <input
          id={`${idPrefix}-price`}
          required
          inputMode="decimal"
          pattern={PATTERN.money}
          title="An amount with up to 2 decimal places"
          value={draft.price}
          onChange={text('price')}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-compare`}>
          Compare-at price <span className="hint">shown struck through</span>
        </label>
        <input
          id={`${idPrefix}-compare`}
          inputMode="decimal"
          pattern={PATTERN.money}
          title="An amount with up to 2 decimal places"
          value={draft.compareAtPrice}
          onChange={text('compareAtPrice')}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-cost`}>
          Cost price <span className="hint">internal</span>
        </label>
        <input
          id={`${idPrefix}-cost`}
          inputMode="decimal"
          pattern={PATTERN.money}
          title="An amount with up to 2 decimal places"
          value={draft.costPrice}
          onChange={text('costPrice')}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-weight`}>Weight (kg)</label>
        <input
          id={`${idPrefix}-weight`}
          inputMode="decimal"
          pattern={PATTERN.decimal3}
          title="A weight with up to 3 decimal places"
          value={draft.weightKg}
          onChange={text('weightKg')}
        />
      </div>
      <label className="check" htmlFor={`${idPrefix}-active`}>
        <input
          id={`${idPrefix}-active`}
          type="checkbox"
          checked={draft.isActive}
          onChange={(e) => onChange({ ...draft, isActive: e.target.checked })}
        />
        Active (can be sold)
      </label>
      <label className="check" htmlFor={`${idPrefix}-on-order`}>
        <input
          id={`${idPrefix}-on-order`}
          type="checkbox"
          checked={draft.isAvailableOnOrder}
          onChange={(e) => onChange({ ...draft, isAvailableOnOrder: e.target.checked })}
        />
        Available on order when out of stock
      </label>
    </div>
  );
}

function VariantRow({ productId, variant }: { productId: string; variant: AdminVariant }) {
  const action = useAction();
  const [draft, setDraft] = useState(() => draftOf(variant));
  const path = `/admin/products/${productId}/variants/${variant.id}`;

  return (
    <details className="panel">
      <summary style={{ cursor: 'pointer' }}>
        <span className="row" style={{ display: 'inline-flex' }}>
          <strong>{variant.sku}</strong>
          {variant.name ? <span>{variant.name}</span> : null}
          <span>{pkr(variant.price)}</span>
          <StatusPill status={variant.isActive ? 'ACTIVE' : 'INACTIVE'} label={variant.isActive ? 'Active' : 'Inactive'} />
          {variant.isAvailableOnOrder ? <span className="pill warn">On order</span> : null}
        </span>
      </summary>
      <form
        className="stack"
        style={{ marginTop: '0.75rem' }}
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(
            () =>
              bff(path, {
                method: 'PATCH',
                body: {
                  sku: draft.sku.trim(),
                  name: textOrNull(draft.name),
                  barcode: textOrNull(draft.barcode),
                  price: draft.price.trim(),
                  compareAtPrice: textOrNull(draft.compareAtPrice),
                  costPrice: textOrNull(draft.costPrice),
                  weightKg: textOrNull(draft.weightKg),
                  isActive: draft.isActive,
                  isAvailableOnOrder: draft.isAvailableOnOrder,
                },
              }),
            { success: 'Variant saved.' },
          );
        }}
      >
        <FormStatus error={action.error} message={action.message} />
        <VariantFields idPrefix={`variant-${variant.id}`} draft={draft} onChange={setDraft} />
        <div className="row">
          <button type="submit" disabled={action.pending}>
            Save variant
          </button>
          <button
            type="button"
            className="danger"
            disabled={action.pending}
            onClick={() =>
              window.confirm(`Delete the variant ${variant.sku}? Its stock records go with it.`) &&
              void action.run(() => bff(path, { method: 'DELETE' }))
            }
          >
            Delete variant
          </button>
        </div>
      </form>
    </details>
  );
}

/** A product's sellable variants: each expands to an edit form; a new one is added below. */
export function VariantsEditor({ productId, variants }: { productId: string; variants: AdminVariant[] }) {
  const action = useAction();
  const [draft, setDraft] = useState<Draft>(EMPTY);

  const create = async () => {
    const created = await action.run(
      () =>
        bff(`/admin/products/${productId}/variants`, {
          method: 'POST',
          body: {
            sku: draft.sku.trim(),
            ...optional('name', draft.name),
            ...optional('barcode', draft.barcode),
            price: draft.price.trim(),
            ...optional('compareAtPrice', draft.compareAtPrice),
            ...optional('costPrice', draft.costPrice),
            ...optional('weightKg', draft.weightKg),
            isActive: draft.isActive,
            isAvailableOnOrder: draft.isAvailableOnOrder,
          },
        }),
      { success: 'Variant added.' },
    );
    if (created) setDraft(EMPTY);
  };

  return (
    <section className="stack" aria-labelledby="variants-heading" data-testid="product-variants">
      <h2 id="variants-heading">Variants ({variants.length})</h2>
      {variants.length === 0 ? <p className="muted">No variants yet. A product needs one to go active.</p> : null}
      {variants.map((variant) => (
        <VariantRow key={variant.id} productId={productId} variant={variant} />
      ))}
      <form
        className="panel stack"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <h3>Add variant</h3>
        <FormStatus error={action.error} message={action.message} />
        <VariantFields idPrefix="variant-new" draft={draft} onChange={setDraft} />
        <div>
          <button type="submit" className="secondary" disabled={action.pending}>
            Add variant
          </button>
        </div>
      </form>
    </section>
  );
}
