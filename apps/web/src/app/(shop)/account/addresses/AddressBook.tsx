'use client';

import { useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { useAction } from '@/components/useAction';
import { bff } from '@/lib/api/client';
import type { Address } from '@/lib/api/types';
import { PROVINCES } from '@/lib/format';

type Draft = Omit<Address, 'id' | 'isDefault' | 'label' | 'area' | 'landmark'> & {
  label: string;
  area: string;
  landmark: string;
  isDefault: boolean;
};

const BLANK: Draft = {
  label: '',
  recipientName: '',
  phone: '',
  province: '',
  city: '',
  area: '',
  addressLine: '',
  landmark: '',
  isDefault: false,
};

function draftOf(address: Address): Draft {
  return {
    label: address.label ?? '',
    recipientName: address.recipientName,
    phone: address.phone,
    province: address.province,
    city: address.city,
    area: address.area ?? '',
    addressLine: address.addressLine,
    landmark: address.landmark ?? '',
    isDefault: address.isDefault,
  };
}

/** REQ-14. The API keeps exactly one default; the list re-renders from it after each change. */
export function AddressBook({ addresses }: { addresses: Address[] }) {
  const action = useAction();
  const [editing, setEditing] = useState<string | 'new' | null>(addresses.length === 0 ? 'new' : null);
  const [draft, setDraft] = useState<Draft>(BLANK);

  const start = (id: string | 'new') => {
    const existing = addresses.find((entry) => entry.id === id);
    setDraft(existing ? draftOf(existing) : BLANK);
    setEditing(id);
  };

  const bind = (key: Exclude<keyof Draft, 'isDefault'>) => ({
    id: `address-${key}`,
    value: draft[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setDraft({ ...draft, [key]: event.target.value }),
  });

  return (
    <div className="stack">
      <FormStatus error={action.error} message={action.message} />
      {addresses.map((address) => (
        <div key={address.id} className="panel spread">
          <div>
            <strong>{address.label || address.recipientName}</strong>{' '}
            {address.isDefault ? <span className="pill ok">Default</span> : null}
            <div className="small">
              {address.recipientName}, {address.addressLine}, {[address.area, address.city, address.province].filter(Boolean).join(', ')} ·{' '}
              {address.phone}
            </div>
          </div>
          <div className="row">
            {!address.isDefault ? (
              <button
                type="button"
                className="secondary small"
                disabled={action.pending}
                onClick={() =>
                  void action.run(
                    () => bff(`/customers/me/addresses/${address.id}`, { method: 'PATCH', body: { isDefault: true } }),
                    { success: 'Default address updated.' },
                  )
                }
              >
                Make default
              </button>
            ) : null}
            <button type="button" className="secondary small" onClick={() => start(address.id)}>
              Edit
            </button>
            <button
              type="button"
              className="danger small"
              disabled={action.pending}
              onClick={() =>
                window.confirm('Delete this address?') &&
                void action.run(() => bff(`/customers/me/addresses/${address.id}`, { method: 'DELETE' }), {
                  success: 'Address deleted.',
                })
              }
            >
              Delete
            </button>
          </div>
        </div>
      ))}

      {editing ? (
        <form
          className="panel stack"
          onSubmit={async (event) => {
            event.preventDefault();
            const optional = (value: string) => (value.trim() ? value.trim() : undefined);
            const body = {
              label: optional(draft.label),
              recipientName: draft.recipientName.trim(),
              phone: draft.phone.trim(),
              province: draft.province,
              city: draft.city.trim(),
              area: optional(draft.area),
              addressLine: draft.addressLine.trim(),
              landmark: optional(draft.landmark),
              ...(draft.isDefault ? { isDefault: true } : {}),
            };
            const done = await action.run(
              () =>
                editing === 'new'
                  ? bff('/customers/me/addresses', { body })
                  : bff(`/customers/me/addresses/${editing}`, { method: 'PATCH', body }),
              { success: 'Address saved.' },
            );
            if (done) setEditing(null);
          }}
        >
          <h2>{editing === 'new' ? 'New address' : 'Edit address'}</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="address-label">Label (optional)</label>
              <input {...bind('label')} placeholder="Home, Office…" />
            </div>
            <div className="field">
              <label htmlFor="address-recipientName">Recipient name</label>
              <input {...bind('recipientName')} required minLength={2} />
            </div>
            <div className="field">
              <label htmlFor="address-phone">Mobile</label>
              <input {...bind('phone')} type="tel" required />
            </div>
            <div className="field">
              <label htmlFor="address-province">Province</label>
              <select {...bind('province')} required>
                <option value="">Choose…</option>
                {PROVINCES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="address-city">City</label>
              <input {...bind('city')} required minLength={2} />
            </div>
            <div className="field">
              <label htmlFor="address-area">Area (optional)</label>
              <input {...bind('area')} />
            </div>
            <div className="field wide">
              <label htmlFor="address-addressLine">House, street and block</label>
              <input {...bind('addressLine')} required minLength={5} />
            </div>
            <div className="field wide">
              <label htmlFor="address-landmark">Nearby landmark (optional)</label>
              <input {...bind('landmark')} />
            </div>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.isDefault}
              onChange={(event) => setDraft({ ...draft, isDefault: event.target.checked })}
            />
            Use as my default address
          </label>
          <div className="row">
            <button type="submit" disabled={action.pending}>
              Save address
            </button>
            {addresses.length > 0 ? (
              <button type="button" className="secondary" onClick={() => setEditing(null)}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      ) : (
        <div>
          <button type="button" className="secondary" onClick={() => start('new')}>
            Add an address
          </button>
        </div>
      )}
    </div>
  );
}
