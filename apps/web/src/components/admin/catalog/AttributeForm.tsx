'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { useAction } from '@/components/useAction';
import {
  ATTRIBUTE_TYPES,
  type AdminAttribute,
  type AttributeType,
  type AttributeValidation,
} from '@/lib/api/admin-catalog-types';
import { bff } from '@/lib/api/client';
import { optional, PATTERN, textOrNull, TYPE_LABEL } from './form-values';

interface RulesDraft {
  min: string;
  max: string;
  step: string;
  pattern: string;
  maxLength: string;
}

function rulesDraft(validation: AttributeValidation | null | undefined): RulesDraft {
  const text = (value: unknown) => (value === undefined || value === null ? '' : String(value));
  return {
    min: text(validation?.min),
    max: text(validation?.max),
    step: text(validation?.step),
    pattern: validation?.pattern ?? '',
    maxLength: text(validation?.maxLength),
  };
}

/** Only NUMBER and TEXT carry rules; the API rejects rules on any other type. */
function rulesPayload(type: AttributeType, draft: RulesDraft): AttributeValidation | null {
  const rules: AttributeValidation = {};
  if (type === 'NUMBER') {
    if (draft.min.trim()) rules.min = draft.min.trim();
    if (draft.max.trim()) rules.max = draft.max.trim();
    if (draft.step.trim()) rules.step = draft.step.trim();
  } else if (type === 'TEXT') {
    if (draft.pattern.trim()) rules.pattern = draft.pattern.trim();
    const maxLength = Number.parseInt(draft.maxLength, 10);
    if (!Number.isNaN(maxLength)) rules.maxLength = maxLength;
  }
  return Object.keys(rules).length > 0 ? rules : null;
}

/** Create (no `attribute`) or edit an attribute definition. Create goes on to the edit page. */
export function AttributeForm({ attribute }: { attribute?: AdminAttribute }) {
  const router = useRouter();
  const action = useAction();
  const [name, setName] = useState(attribute?.name ?? '');
  const [slug, setSlug] = useState(attribute?.slug ?? '');
  const [description, setDescription] = useState(attribute?.description ?? '');
  const [type, setType] = useState<AttributeType>(attribute?.type ?? 'TEXT');
  const [unit, setUnit] = useState(attribute?.unit ?? '');
  const [isSearchable, setIsSearchable] = useState(attribute?.isSearchable ?? false);
  const [isComparable, setIsComparable] = useState(attribute?.isComparable ?? true);
  const [rules, setRules] = useState(rulesDraft(attribute?.validation));

  const submit = async () => {
    const validation = rulesPayload(type, rules);
    if (attribute) {
      await action.run(
        () =>
          bff(`/admin/attributes/${attribute.id}`, {
            method: 'PATCH',
            body: {
              name: name.trim(),
              ...optional('slug', slug),
              description: textOrNull(description),
              type,
              unit: textOrNull(unit),
              validation,
              isSearchable,
              isComparable,
            },
          }),
        { success: 'Attribute saved.' },
      );
      return;
    }
    const created = await action.run(
      () =>
        bff<AdminAttribute>('/admin/attributes', {
          method: 'POST',
          body: {
            name: name.trim(),
            ...optional('slug', slug),
            ...optional('description', description),
            type,
            ...optional('unit', unit),
            ...(validation ? { validation } : {}),
            isSearchable,
            isComparable,
          },
        }),
      { refresh: false },
    );
    if (created) router.push(`/admin/attributes/${created.data.id}`);
  };

  const setRule = (key: keyof RulesDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setRules((current) => ({ ...current, [key]: e.target.value }));

  return (
    <form
      className="panel stack"
      data-testid="attribute-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <FormStatus error={action.error} message={action.message} />
      <div className="form-grid">
        <div className="field">
          <label htmlFor="attribute-name">Name</label>
          <input id="attribute-name" required maxLength={160} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="attribute-slug">
            Slug <span className="hint">{attribute ? 'used in filter URLs' : 'blank: made from the name'}</span>
          </label>
          <input
            id="attribute-slug"
            pattern={PATTERN.slug}
            maxLength={80}
            title="Lowercase letters, numbers and hyphens"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="attribute-type">
            Type{attribute ? <span className="hint"> fixed once options or values exist</span> : null}
          </label>
          <select id="attribute-type" value={type} onChange={(e) => setType(e.target.value as AttributeType)}>
            {ATTRIBUTE_TYPES.map((value) => (
              <option key={value} value={value}>
                {TYPE_LABEL[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="attribute-unit">
            Unit <span className="hint">e.g. inch, kg, W</span>
          </label>
          <input id="attribute-unit" maxLength={32} value={unit} onChange={(e) => setUnit(e.target.value)} />
        </div>
        <div className="field wide">
          <label htmlFor="attribute-description">Description</label>
          <textarea
            id="attribute-description"
            rows={2}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <label className="check" htmlFor="attribute-searchable">
          <input
            id="attribute-searchable"
            type="checkbox"
            checked={isSearchable}
            onChange={(e) => setIsSearchable(e.target.checked)}
          />
          Searchable (values feed storefront search)
        </label>
        <label className="check" htmlFor="attribute-comparable">
          <input
            id="attribute-comparable"
            type="checkbox"
            checked={isComparable}
            onChange={(e) => setIsComparable(e.target.checked)}
          />
          Comparable (shown in product comparison)
        </label>

        {type === 'NUMBER' ? (
          <fieldset className="form-grid wide">
            <legend>Number rules (optional)</legend>
            {(['min', 'max', 'step'] as const).map((key) => (
              <div className="field" key={key}>
                <label htmlFor={`attribute-rule-${key}`}>{key === 'min' ? 'Minimum' : key === 'max' ? 'Maximum' : 'Step'}</label>
                <input
                  id={`attribute-rule-${key}`}
                  inputMode="decimal"
                  pattern={PATTERN.decimal3}
                  title="A non-negative number with up to 3 decimal places"
                  value={rules[key]}
                  onChange={setRule(key)}
                />
              </div>
            ))}
          </fieldset>
        ) : null}
        {type === 'TEXT' ? (
          <fieldset className="form-grid wide">
            <legend>Text rules (optional)</legend>
            <div className="field">
              <label htmlFor="attribute-rule-pattern">Pattern (regular expression)</label>
              <input id="attribute-rule-pattern" maxLength={200} value={rules.pattern} onChange={setRule('pattern')} />
            </div>
            <div className="field">
              <label htmlFor="attribute-rule-maxLength">Maximum length</label>
              <input
                id="attribute-rule-maxLength"
                type="number"
                min={1}
                max={5000}
                value={rules.maxLength}
                onChange={setRule('maxLength')}
              />
            </div>
          </fieldset>
        ) : null}
      </div>
      <div>
        <button type="submit" disabled={action.pending}>
          {attribute ? 'Save attribute' : 'Create attribute'}
        </button>
      </div>
    </form>
  );
}
