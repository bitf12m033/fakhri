'use client';

import { useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { useAction } from '@/components/useAction';
import type { AttributeOption } from '@/lib/api/admin-catalog-types';
import { bff } from '@/lib/api/client';
import { PATTERN } from './form-values';

function OptionRow({ attributeId, option }: { attributeId: string; option: AttributeOption }) {
  const action = useAction();
  const [value, setValue] = useState(option.value);
  const [label, setLabel] = useState(option.label);
  const [sortOrder, setSortOrder] = useState(String(option.sortOrder));
  const id = `option-${option.id}`;
  const path = `/admin/attributes/${attributeId}/options/${option.id}`;

  return (
    <tr>
      <td>
        <label htmlFor={`${id}-label`} className="visually-hidden">
          Label for {option.label}
        </label>
        <input id={`${id}-label`} required maxLength={120} value={label} onChange={(e) => setLabel(e.target.value)} />
      </td>
      <td>
        <label htmlFor={`${id}-value`} className="visually-hidden">
          Value for {option.label}
        </label>
        <input
          id={`${id}-value`}
          required
          pattern={PATTERN.slug}
          maxLength={80}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </td>
      <td style={{ width: '6rem' }}>
        <label htmlFor={`${id}-sort`} className="visually-hidden">
          Sort order for {option.label}
        </label>
        <input
          id={`${id}-sort`}
          type="number"
          min={0}
          max={100000}
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />
      </td>
      <td>
        <div className="row">
          <button
            type="button"
            className="secondary small"
            disabled={action.pending}
            onClick={() =>
              void action.run(
                () =>
                  bff(path, {
                    method: 'PATCH',
                    body: { value: value.trim(), label: label.trim(), sortOrder: Number.parseInt(sortOrder, 10) || 0 },
                  }),
                { success: 'Saved.' },
              )
            }
          >
            Save<span className="visually-hidden"> {option.label}</span>
          </button>
          <button
            type="button"
            className="danger small"
            disabled={action.pending}
            onClick={() =>
              window.confirm(`Delete the option "${option.label}"?`) &&
              void action.run(() => bff(path, { method: 'DELETE' }))
            }
          >
            Delete<span className="visually-hidden"> {option.label}</span>
          </button>
        </div>
        <FormStatus error={action.error} message={action.message} />
      </td>
    </tr>
  );
}

/** Options of an OPTION attribute: edit in place, add, delete (blocked while products use one). */
export function OptionsEditor({ attributeId, options }: { attributeId: string; options: AttributeOption[] }) {
  const action = useAction();
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [sortOrder, setSortOrder] = useState('0');

  return (
    <section className="panel stack" aria-labelledby="options-heading" data-testid="options-editor">
      <h2 id="options-heading">Options</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Label</th>
              <th>Value (URL key)</th>
              <th>Sort</th>
              <th>
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {options.map((option) => (
              <OptionRow key={option.id} attributeId={attributeId} option={option} />
            ))}
            {options.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  No options yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const created = await action.run(
            () =>
              bff(`/admin/attributes/${attributeId}/options`, {
                method: 'POST',
                body: { value: value.trim(), label: label.trim(), sortOrder: Number.parseInt(sortOrder, 10) || 0 },
              }),
            { success: 'Option added.' },
          );
          if (created) {
            setValue('');
            setLabel('');
            setSortOrder('0');
          }
        }}
      >
        <h3>Add option</h3>
        <FormStatus error={action.error} message={action.message} />
        <div className="form-grid">
          <div className="field">
            <label htmlFor="option-new-label">Label</label>
            <input
              id="option-new-label"
              required
              maxLength={120}
              value={label}
              placeholder="e.g. 4K UHD"
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="option-new-value">
              Value <span className="hint">lowercase-hyphenated</span>
            </label>
            <input
              id="option-new-value"
              required
              pattern={PATTERN.slug}
              maxLength={80}
              value={value}
              placeholder="e.g. uhd"
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="option-new-sort">Sort order</label>
            <input
              id="option-new-sort"
              type="number"
              min={0}
              max={100000}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>
        </div>
        <div>
          <button type="submit" className="secondary" disabled={action.pending}>
            Add option
          </button>
        </div>
      </form>
    </section>
  );
}
