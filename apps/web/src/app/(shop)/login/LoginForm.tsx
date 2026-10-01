'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { reloadSession } from '@/components/shop/session-store';
import { useAction } from '@/components/useAction';
import { bff } from '@/lib/api/client';

type Mode = 'otp' | 'password';

/**
 * Phone OTP first (DEC-08: the primary channel in this market), password as the
 * alternative (REQ-12/13). A verified OTP for a new number creates the account.
 */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const action = useAction();
  const [mode, setMode] = useState<Mode>('otp');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);

  async function signedIn() {
    await reloadSession();
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="stack">
      <div className="row" role="tablist" aria-label="Sign-in method">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'otp'}
          className={mode === 'otp' ? 'small' : 'secondary small'}
          onClick={() => setMode('otp')}
        >
          One-time code
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'password'}
          className={mode === 'password' ? 'small' : 'secondary small'}
          onClick={() => setMode('password')}
        >
          Password
        </button>
      </div>

      <div className="field">
        <label htmlFor="login-phone">Mobile number</label>
        <input
          id="login-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          placeholder="0300 1234567"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </div>

      {mode === 'password' ? (
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            const done = await action.run(
              () => bff('/auth/customer/login', { body: { phone: phone.trim(), password } }),
              { refresh: false },
            );
            if (done) await signedIn();
          }}
        >
          <div className="field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <FormStatus error={action.error} />
          <button type="submit" disabled={action.pending}>
            Sign in
          </button>
        </form>
      ) : (
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!codeSent) {
              const sent = await action.run(
                () => bff<{ devCode?: string }>('/auth/customer/otp/request', { body: { phone: phone.trim() } }),
                { refresh: false, success: 'We sent a 6-digit code to your phone.' },
              );
              if (sent) {
                setCodeSent(true);
                setDevCode(sent.data.devCode ?? null);
              }
              return;
            }
            const done = await action.run(
              () => bff('/auth/customer/otp/verify', { body: { phone: phone.trim(), code: code.trim() } }),
              { refresh: false },
            );
            if (done) await signedIn();
          }}
        >
          {codeSent ? (
            <div className="field">
              <label htmlFor="login-code">6-digit code</label>
              <input
                id="login-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              />
              {devCode ? <span className="hint">Development only — your code is {devCode}</span> : null}
            </div>
          ) : null}
          <FormStatus error={action.error} message={action.message} />
          <button type="submit" disabled={action.pending}>
            {codeSent ? 'Verify and sign in' : 'Send code'}
          </button>
          {codeSent ? (
            <button
              type="button"
              className="link small"
              onClick={() => {
                setCodeSent(false);
                setCode('');
              }}
            >
              Use a different number or resend
            </button>
          ) : null}
        </form>
      )}
    </div>
  );
}
