'use client';

import { useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { useAction } from '@/components/useAction';
import { bff } from '@/lib/api/client';

const EMPTY = { code: '', name: '', address: '', city: '', phone: '' };

export function WarehouseForm() {
  const action = useAction();
  const [form, setForm] = useState(EMPTY);
  const [isActive, setIsActive] = useState(true);
  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: e.target.value }));

  return (
    <form
      className="panel stack"
      aria-labelledby="warehouse-heading"
      onSubmit={async (e) => {
        e.preventDefault();
        const result = await action.run(
          () =>
            bff('/admin/inventory/warehouses', {
              method: 'POST',
              body: {
                code: form.code.trim(),
                name: form.name.trim(),
                address: form.address.trim(),
                city: form.city.trim(),
                ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
                isActive,
              },
            }),
          { success: 'Warehouse created.' },
        );
        if (result) {
          setForm(EMPTY);
          setIsActive(true);
        }
      }}
    >
      <h2 id="warehouse-heading">New warehouse</h2>
      <FormStatus error={action.error} message={action.message} />
      <div className="field">
        <label htmlFor="wh-code">Code</label>
        <input
          id="wh-code"
          value={form.code}
          onChange={set('code')}
          minLength={2}
          maxLength={20}
          required
          aria-describedby="wh-code-hint"
        />
        <span className="hint" id="wh-code-hint">
          Short and unique, e.g. KHI-MAIN. Stored in capitals.
        </span>
      </div>
      <div className="field">
        <label htmlFor="wh-name">Name</label>
        <input id="wh-name" value={form.name} onChange={set('name')} minLength={2} maxLength={120} required />
      </div>
      <div className="field">
        <label htmlFor="wh-address">Address</label>
        <input id="wh-address" value={form.address} onChange={set('address')} minLength={4} maxLength={300} required />
      </div>
      <div className="field">
        <label htmlFor="wh-city">City</label>
        <input id="wh-city" value={form.city} onChange={set('city')} minLength={2} maxLength={60} required />
      </div>
      <div className="field">
        <label htmlFor="wh-phone">Phone (optional)</label>
        <input id="wh-phone" type="tel" value={form.phone} onChange={set('phone')} maxLength={24} />
      </div>
      <label className="check" htmlFor="wh-active">
        <input id="wh-active" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Active
      </label>
      <button type="submit" disabled={action.pending}>
        Create warehouse
      </button>
    </form>
  );
}
