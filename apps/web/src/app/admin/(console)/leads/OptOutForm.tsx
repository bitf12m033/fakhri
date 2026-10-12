'use client';

import { useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { useAction } from '@/components/useAction';
import { bff } from '@/lib/api/client';

/** Record a STOP reply against a number that is already a lead. */
export function OptOutForm() {
  const [phone, setPhone] = useState('');
  const action = useAction();

  return (
    <div>
      <form
        className="toolbar"
        onSubmit={async (event) => {
          event.preventDefault();
          const saved = await action.run(() => bff('/admin/leads/opt-out', { method: 'POST', body: { phone: phone.trim() } }), {
            success: 'Marked as opted out.',
          });
          if (saved) setPhone('');
        }}
      >
        <div className="field">
          <label htmlFor="stop-phone">Record a STOP reply</label>
          <input
            id="stop-phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="03…"
            inputMode="tel"
            required
          />
        </div>
        <button type="submit" className="secondary" disabled={action.pending} data-testid="record-stop">
          {action.pending ? 'Working…' : 'Opt out'}
        </button>
      </form>
      {action.error ? <FormStatus error={action.error} /> : null}
      {action.message ? <FormStatus error={null} message={action.message} /> : null}
    </div>
  );
}
