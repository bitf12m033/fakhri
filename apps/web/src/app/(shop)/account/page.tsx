import { sessionApi } from '@/lib/api/server';
import type { Customer } from '@/lib/api/types';
import { day } from '@/lib/format';
import { PasswordForm, ProfileForm } from './ProfileForms';

export const metadata = { title: 'Profile' };

export default async function AccountPage() {
  const { data: customer } = await sessionApi<Customer>('/customers/me', { session: 'customer' });
  return (
    <>
      <div>
        <h1>Hello{customer.firstName ? `, ${customer.firstName}` : ''}</h1>
        <p className="muted small" style={{ margin: 0 }}>
          {customer.phone}
          {customer.isPhoneVerified ? ' · verified' : ''} · member since {day(customer.createdAt)}
        </p>
      </div>
      <section className="panel stack" aria-labelledby="profile">
        <h2 id="profile">Your details</h2>
        <ProfileForm customer={customer} />
      </section>
      <section className="panel stack" aria-labelledby="password">
        <h2 id="password">{customer.hasPassword ? 'Change password' : 'Set a password'}</h2>
        {!customer.hasPassword ? (
          <p className="small muted" style={{ margin: 0 }}>
            You sign in with a one-time code. A password lets you sign in without waiting for an SMS.
          </p>
        ) : null}
        <PasswordForm hasPassword={customer.hasPassword} />
      </section>
    </>
  );
}
