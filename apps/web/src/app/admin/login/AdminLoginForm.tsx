'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { useAction } from '@/components/useAction';
import { bff } from '@/lib/api/client';

export function AdminLoginForm({ next }: { next: string }) {
  const router = useRouter();
  const action = useAction();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        const done = await action.run(() => bff('/admin/auth/login', { body: { email, password } }), {
          refresh: false,
        });
        if (done) {
          router.replace(next);
          router.refresh();
        }
      }}
    >
      <div className="field">
        <label htmlFor="admin-email">Email</label>
        <input
          id="admin-email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="admin-password">Password</label>
        <input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <FormStatus error={action.error} />
      <button type="submit" disabled={action.pending}>
        {action.pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
