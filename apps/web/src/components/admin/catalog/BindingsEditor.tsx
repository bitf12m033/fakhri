'use client';

import { useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { useAction } from '@/components/useAction';
import type { AdminAttributeRow, TemplateBinding } from '@/lib/api/admin-catalog-types';
import { bff } from '@/lib/api/client';

interface Row {
  attributeId: string;
  group: string;
  sortOrder: string;
  isRequired: boolean;
  isFilterable: boolean;
  isComparable: boolean;
}

function toRow(binding: TemplateBinding): Row {
  return {
    attributeId: binding.attributeId,
    group: binding.group ?? '',
    sortOrder: String(binding.sortOrder),
    isRequired: binding.isRequired,
    isFilterable: binding.isFilterable,
    isComparable: binding.isComparable,
  };
}

/**
 * The category's own attribute bindings. PUT replaces the whole set, so the
 * editor always sends every row. Inherited bindings are listed read-only; binding
 * the same attribute here overrides the parent's settings for this subtree.
 */
export function BindingsEditor({
  categoryId,
  bindings,
  inherited,
  attributes,
}: {
  categoryId: string;
  bindings: TemplateBinding[];
  inherited: TemplateBinding[];
  attributes: AdminAttributeRow[];
}) {
  const action = useAction();
  const [rows, setRows] = useState<Row[]>(() => bindings.map(toRow));
  const [adding, setAdding] = useState('');

  const byId = new Map(attributes.map((attribute) => [attribute.id, attribute]));
  const bound = new Set(rows.map((row) => row.attributeId));
  const available = attributes.filter((attribute) => !bound.has(attribute.id));

  const update = (index: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const add = () => {
    if (!adding) return;
    const inheritedRow = inherited.find((binding) => binding.attributeId === adding);
    const nextOrder = rows.reduce((max, row) => Math.max(max, Number.parseInt(row.sortOrder, 10) || 0), 0) + 1;
    setRows((current) => [
      ...current,
      inheritedRow
        ? toRow(inheritedRow)
        : { attributeId: adding, group: '', sortOrder: String(nextOrder), isRequired: false, isFilterable: false, isComparable: true },
    ]);
    setAdding('');
  };

  const save = () =>
    void action.run(
      () =>
        bff(`/admin/categories/${categoryId}/attributes`, {
          method: 'PUT',
          body: {
            bindings: rows.map((row) => ({
              attributeId: row.attributeId,
              group: row.group.trim() || null,
              sortOrder: Number.parseInt(row.sortOrder, 10) || 0,
              isRequired: row.isRequired,
              isFilterable: row.isFilterable,
              isComparable: row.isComparable,
            })),
          },
        }),
      { success: 'Attribute bindings saved.' },
    );

  return (
    <section className="panel stack" aria-labelledby="bindings-heading" data-testid="bindings-editor">
      <h2 id="bindings-heading">Attributes</h2>
      <p className="muted small" style={{ margin: 0 }}>
        Products in this category and its subcategories fill in these attributes. Required ones must be set before a
        product can go live.
      </p>
      <FormStatus error={action.error} message={action.message} />

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Attribute</th>
              <th>Group</th>
              <th>Sort</th>
              <th>Required</th>
              <th>Filterable</th>
              <th>Comparable</th>
              <th>
                <span className="visually-hidden">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const attribute = byId.get(row.attributeId);
              const label = attribute?.name ?? row.attributeId;
              const id = `binding-${row.attributeId}`;
              return (
                <tr key={row.attributeId}>
                  <td>
                    {label}{' '}
                    <span className="muted small">
                      {attribute?.type.toLowerCase()}
                      {attribute?.unit ? ` · ${attribute.unit}` : ''}
                    </span>
                  </td>
                  <td>
                    <label htmlFor={`${id}-group`} className="visually-hidden">
                      Group for {label}
                    </label>
                    <input
                      id={`${id}-group`}
                      maxLength={80}
                      value={row.group}
                      placeholder="e.g. Display"
                      onChange={(e) => update(index, { group: e.target.value })}
                    />
                  </td>
                  <td style={{ width: '6rem' }}>
                    <label htmlFor={`${id}-sort`} className="visually-hidden">
                      Sort order for {label}
                    </label>
                    <input
                      id={`${id}-sort`}
                      type="number"
                      min={0}
                      max={100000}
                      value={row.sortOrder}
                      onChange={(e) => update(index, { sortOrder: e.target.value })}
                    />
                  </td>
                  {(['isRequired', 'isFilterable', 'isComparable'] as const).map((flag) => (
                    <td key={flag}>
                      <label htmlFor={`${id}-${flag}`} className="visually-hidden">
                        {flag.slice(2)} for {label}
                      </label>
                      <input
                        id={`${id}-${flag}`}
                        type="checkbox"
                        checked={row[flag]}
                        onChange={(e) => update(index, { [flag]: e.target.checked })}
                      />
                    </td>
                  ))}
                  <td>
                    <button
                      type="button"
                      className="secondary small"
                      onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                    >
                      Remove<span className="visually-hidden"> {label}</span>
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  No attributes bound directly to this category.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ minWidth: '16rem' }}>
          <label htmlFor="binding-add">Add attribute</label>
          <select id="binding-add" value={adding} onChange={(e) => setAdding(e.target.value)}>
            <option value="">Choose…</option>
            {available.map((attribute) => (
              <option key={attribute.id} value={attribute.id}>
                {attribute.name} ({attribute.type.toLowerCase()})
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="secondary" disabled={!adding} onClick={add}>
          Add
        </button>
      </div>

      <div>
        <button type="button" disabled={action.pending} onClick={save}>
          Save attributes
        </button>
      </div>

      {inherited.length > 0 ? (
        <div className="stack">
          <h3>Inherited from parent categories</h3>
          <ul className="small" style={{ margin: 0 }}>
            {inherited.map((binding) => (
              <li key={binding.attributeId}>
                {binding.attribute.name}
                {binding.group ? ` · ${binding.group}` : ''}
                {binding.isRequired ? ' · required' : ''}
                {binding.isFilterable ? ' · filterable' : ''}
                {bound.has(binding.attributeId) ? ' · overridden here' : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
