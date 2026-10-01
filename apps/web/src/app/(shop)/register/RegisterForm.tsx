'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { reloadSession } from '@/components/shop/session-store';
import { useAction } from '@/components/useAction';
import { bff } from '@/lib/api/client';

/** Password registration (REQ-12). The API owns the password policy and says what it wants. */
export function RegisterForm({ next }: { next: string }) {
  const router = useRouter();
  const action = useAction();
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', password: '' });
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const bind = (key: keyof typeof form) => ({
    id: `register-${key}`,
    value: form[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value }),
  });

  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        const optional = (value: string) => (value.trim() ? value.trim() : undefined);
        const done = await action.run(
          () =>
            bff('/auth/customer/register', {
              body: {
                phone: form.phone.trim(),
                password: form.password,
                email: optional(form.email),
                firstName: optional(form.firstName),
                lastName: optional(form.lastName),
                whatsappConsent,
              },
            }),
          { refresh: false },
        );
        if (!done) return;
        await reloadSession();
        router.replace(next);
        router.refresh();
      }}
    >
      <div className="form-grid">
        <div className="field">
          <label htmlFor="register-firstName">First name</label>
          <input {...bind('firstName')} autoComplete="given-name" />
        </div>
        <div className="field">
          <label htmlFor="register-lastName">Last name</label>
          <input {...bind('lastName')} autoComplete="family-name" />
        </div>
        <div className="field">
          <label htmlFor="register-phone">Mobile number</label>
          <input {...bind('phone')} type="tel" inputMode="tel" autoComplete="tel" required placeholder="0300 1234567" />
        </div>
        <div className="field">
          <label htmlFor="register-email">Email (optional)</label>
          <input {...bind('email')} type="email" autoComplete="email" />
        </div>
        <div className="field wide">
          <label htmlFor="register-password">Password</label>
          <input {...bind('password')} type="password" autoComplete="new-password" required minLength={8} />
          <span className="hint">At least 8 characters, mixing letters and numbers.</span>
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={whatsappConsent} onChange={(event) => setWhatsappConsent(event.target.checked)} />
        Send me order updates on WhatsApp
      </label>
      <FormStatus error={action.error} />
      <button type="submit" disabled={action.pending}>
        Create account
      </button>
    </form>
  );
}
