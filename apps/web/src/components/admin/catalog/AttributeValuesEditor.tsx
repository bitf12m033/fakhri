'use client';

import { useEffect, useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { useAction } from '@/components/useAction';
import type { AttributeValue, ProductStatus, TemplateBinding } from '@/lib/api/admin-catalog-types';
import { bff } from '@/lib/api/client';
import { messageOf } from '@/lib/api/errors';
import { PATTERN } from './form-values';

type Drafts = Record<string, string>;

/** Every input is a string: option id, decimal text, 'true'/'false', text, or JSON source. */
function draftOf(value: AttributeValue): string {
  switch (value.attribute.type) {
    case 'OPTION':
      return value.optionValueId ?? '';
    case 'NUMBER':
      return value.numberValue ?? '';
    case 'BOOLEAN':
      return value.booleanValue === null ? '' : String(value.booleanValue);
    case 'TEXT':
      return value.textValue ?? '';
    case 'JSON':
      return value.jsonValue == null ? '' : JSON.stringify(value.jsonValue, null, 2);
  }
}

/** The stored value as a write DTO, exactly one typed field set. */
function storedPayload(value: AttributeValue): Record<string, unknown> {
  const { attributeId } = value;
  if (value.optionValueId !== null) return { attributeId, optionValueId: value.optionValueId };
  if (value.numberValue !== null) return { attributeId, numberValue: value.numberValue };
  if (value.booleanValue !== null) return { attributeId, booleanValue: value.booleanValue };
  if (value.textValue !== null) return { attributeId, textValue: value.textValue };
  return { attributeId, jsonValue: value.jsonValue };
}

function draftPayload(binding: TemplateBinding, draft: string): Record<string, unknown> | null {
  const attributeId = binding.attributeId;
  const text = draft.trim();
  if (!text) return null;
  switch (binding.attribute.type) {
    case 'OPTION':
      return { attributeId, optionValueId: text };
    case 'NUMBER':
      return { attributeId, numberValue: text };
    case 'BOOLEAN':
      return { attributeId, booleanValue: text === 'true' };
    case 'TEXT':
      return { attributeId, textValue: text };
    case 'JSON':
      try {
        return { attributeId, jsonValue: JSON.parse(text) as unknown };
      } catch {
        throw new Error(`${binding.attribute.name} is not valid JSON.`);
      }
  }
}

function AttributeInput({
  binding,
  value,
  onChange,
}: {
  binding: TemplateBinding;
  value: string;
  onChange: (next: string) => void;
}) {
  const { attribute } = binding;
  const id = `attr-${attribute.id}`;
  const label = (
    <label htmlFor={id}>
      {attribute.name}
      {attribute.unit ? ` (${attribute.unit})` : ''}
      {binding.isRequired ? (
        <>
          {' '}
          <span aria-hidden="true" style={{ color: 'var(--danger)' }}>
            *
          </span>
          <span className="visually-hidden"> (required)</span>
        </>
      ) : null}
      {binding.inherited ? <span className="hint"> from parent category</span> : null}
    </label>
  );
  const common = { id, 'aria-required': binding.isRequired || undefined } as const;

  let input: React.ReactNode;
  switch (attribute.type) {
    case 'OPTION':
      input = (
        <select {...common} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Not set</option>
          {attribute.options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      );
      break;
    case 'BOOLEAN':
      input = (
        <select {...common} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Not set</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
      break;
    case 'NUMBER':
      input = (
        <input
          {...common}
          inputMode="decimal"
          pattern={PATTERN.decimal3}
          title="A non-negative number with up to 3 decimal places"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case 'TEXT':
      input = <input {...common} maxLength={5000} value={value} onChange={(e) => onChange(e.target.value)} />;
      break;
    case 'JSON':
      input = (
        <textarea
          {...common}
          rows={3}
          style={{ fontFamily: 'monospace' }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
  }

  return (
    <div className={attribute.type === 'JSON' ? 'field wide' : 'field'}>
      {label}
      {input}
      {attribute.description ? <span className="hint">{attribute.description}</span> : null}
    </div>
  );
}

/** Bindings grouped by their `group`, keeping the template's sort order. */
function groupBindings(bindings: TemplateBinding[]): [string, TemplateBinding[]][] {
  const groups = new Map<string, TemplateBinding[]>();
  for (const binding of bindings) {
    const key = binding.group ?? 'Other';
    groups.set(key, [...(groups.get(key) ?? []), binding]);
  }
  return [...groups.entries()];
}

/**
 * Product-level attribute values, rendered from the category's effective
 * template. PUT replaces the whole set. While a category change is unsaved the
 * editor shows the new category's template but also keeps values outside it:
 * a live product's values are still checked against the old category until the
 * move is saved.
 */
export function AttributeValuesEditor({
  productId,
  productStatus,
  savedCategoryId,
  categoryId,
  initialTemplate,
  values,
}: {
  productId: string;
  productStatus: ProductStatus;
  savedCategoryId: string;
  categoryId: string;
  initialTemplate: TemplateBinding[];
  values: AttributeValue[];
}) {
  const action = useAction();
  const [templates, setTemplates] = useState<Record<string, TemplateBinding[]>>({ [savedCategoryId]: initialTemplate });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Drafts>(() =>
    Object.fromEntries(values.map((value) => [value.attributeId, draftOf(value)])),
  );

  const template = categoryId ? templates[categoryId] : [];

  useEffect(() => {
    if (!categoryId || templates[categoryId]) return;
    let cancelled = false;
    setLoadError(null);
    bff<TemplateBinding[]>(`/admin/categories/${categoryId}/attribute-template`)
      .then(({ data }) => {
        if (!cancelled) setTemplates((current) => ({ ...current, [categoryId]: data }));
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(messageOf(error));
      });
    return () => {
      cancelled = true;
    };
  }, [categoryId, templates]);

  const pendingMove = categoryId !== savedCategoryId;
  const inTemplate = new Set((template ?? []).map((binding) => binding.attributeId));
  const outside = values.filter((value) => !inTemplate.has(value.attributeId));

  const save = () => {
    if (!template) return;
    void action.run(
      () => {
        const payload = template
          .map((binding) => draftPayload(binding, drafts[binding.attributeId] ?? ''))
          .filter((value): value is Record<string, unknown> => value !== null);
        if (pendingMove) payload.push(...outside.map(storedPayload));
        return bff(`/admin/products/${productId}/attribute-values`, { method: 'PUT', body: { values: payload } });
      },
      { success: 'Attributes saved.' },
    );
  };

  return (
    <section className="panel stack" aria-labelledby="attributes-heading" data-testid="product-attributes">
      <h2 id="attributes-heading">Attributes</h2>
      {pendingMove ? (
        <div className="notice info" role="status">
          Showing the attributes of the newly chosen category.{' '}
          {productStatus === 'ACTIVE'
            ? 'Save these first, then save the details to complete the move.'
            : 'Save the details to complete the move.'}
        </div>
      ) : null}
      <FormStatus error={loadError ?? action.error} message={action.message} />

      {!template ? (
        <p className="muted">{loadError ? 'Could not load this category’s attributes.' : 'Loading attributes…'}</p>
      ) : template.length === 0 ? (
        <p className="muted">This category has no attributes. Bind some on the category page.</p>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {groupBindings(template).map(([group, bindings]) => (
            <fieldset key={group} className="form-grid">
              <legend>{group}</legend>
              {bindings.map((binding) => (
                <AttributeInput
                  key={binding.attributeId}
                  binding={binding}
                  value={drafts[binding.attributeId] ?? ''}
                  onChange={(next) => setDrafts((current) => ({ ...current, [binding.attributeId]: next }))}
                />
              ))}
            </fieldset>
          ))}
          <p className="small muted" style={{ margin: 0 }}>
            <span aria-hidden="true">*</span> Required before the product can be active.
          </p>
          {outside.length > 0 ? (
            <p className="small muted" style={{ margin: 0 }}>
              Also stored, outside this category: {outside.map((value) => value.attribute.name).join(', ')}.{' '}
              {pendingMove ? 'Kept until the move is saved.' : 'Saving removes them.'}
            </p>
          ) : null}
          <div>
            <button type="submit" disabled={action.pending}>
              Save attributes
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
