'use client';

import { useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { useAction } from '@/components/useAction';
import { bff } from '@/lib/api/client';
import type { Customer } from '@/lib/api/types';

export function ProfileForm({ customer }: { customer: Customer }) {
  const action = useAction();
  const [firstName, setFirstName] = useState(customer.firstName ?? '');
  const [lastName, setLastName] = useState(customer.lastName ?? '');
  const [email, setEmail] = useState(customer.email ?? '');
  const [whatsappConsent, setWhatsappConsent] = useState(customer.whatsappConsent);

  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(
          () =>
            bff('/customers/me', {
              method: 'PATCH',
              body: {
                firstName: firstName.trim() || undefined,
                lastName: lastName.trim() || undefined,
                email: email.trim() || undefined,
                whatsappConsent,
              },
            }),
          { success: 'Saved.' },
        );
      }}
    >
      <div className="form-grid">
        <div className="field">
          <label htmlFor="first-name">First name</label>
          <input id="first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="last-name">Last name</label>
          <input id="last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={whatsappConsent} onChange={(e) => setWhatsappConsent(e.target.checked)} />
        Order updates on WhatsApp
      </label>
      <FormStatus error={action.error} message={action.message} />
      <div>
        <button type="submit" disabled={action.pending}>
          Save
        </button>
      </div>
    </form>
  );
}

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const action = useAction();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        // The API rotates every session on a password change; the BFF stores the new pair.
        const done = await action.run(
          () =>
            bff('/customers/me/password', {
              body: { ...(hasPassword ? { currentPassword } : {}), newPassword },
            }),
          { success: 'Password saved. Other devices have been signed out.' },
        );
        if (done) {
          setCurrentPassword('');
          setNewPassword('');
        }
      }}
    >
      <div className="form-grid">
        {hasPassword ? (
          <div className="field">
            <label htmlFor="current-password">Current password</label>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>
      </div>
      <FormStatus error={action.error} message={action.message} />
      <div>
        <button type="submit" disabled={action.pending}>
          {hasPassword ? 'Change password' : 'Set password'}
        </button>
      </div>
    </form>
  );
}
