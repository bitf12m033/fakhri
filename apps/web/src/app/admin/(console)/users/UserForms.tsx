'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { useAction } from '@/components/useAction';
import type { AdminRole } from '@/lib/admin';
import type { AdminUser } from '@/lib/api/admin-ops-types';
import { bff } from '@/lib/api/client';

/** Listed here rather than imported: lib/admin.ts reads cookies and is server-only. */
const ROLES: { value: AdminRole; label: string }[] = [
  { value: 'SUPER_ADMIN', label: 'Super admin (everything)' },
  { value: 'CATALOG', label: 'Catalog' },
  { value: 'INVENTORY', label: 'Inventory' },
  { value: 'ORDERS', label: 'Orders and reports' },
  { value: 'MARKETING', label: 'Marketing (coupons, content, reviews)' },
  { value: 'SUPPORT', label: 'Support (reviews)' },
];

const MIN_PASSWORD = 8;

function RoleSelect({ id, value, onChange }: { id: string; value: AdminRole; onChange: (role: AdminRole) => void }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value as AdminRole)}>
      {ROLES.map((role) => (
        <option key={role.value} value={role.value}>
          {role.label}
        </option>
      ))}
    </select>
  );
}

export function CreateUserForm() {
  const router = useRouter();
  const action = useAction();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AdminRole>('SUPPORT');

  return (
    <form
      className="panel stack"
      aria-labelledby="create-user-heading"
      onSubmit={async (e) => {
        e.preventDefault();
        if (password.length < MIN_PASSWORD) {
          action.setError(`The password must be at least ${MIN_PASSWORD} characters.`);
          return;
        }
        const created = await action.run(
          () =>
            bff<AdminUser>('/admin/users', {
              method: 'POST',
              body: { name: name.trim(), email: email.trim(), password, role },
            }),
          { refresh: false },
        );
        if (created) router.push(`/admin/users/${created.data.id}?created=1`);
      }}
    >
      <h2 id="create-user-heading">New admin user</h2>
      <FormStatus error={action.error} message={action.message} />
      <div className="field">
        <label htmlFor="user-name">Name</label>
        <input id="user-name" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={120} required />
      </div>
      <div className="field">
        <label htmlFor="user-email">Email</label>
        <input
          id="user-email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={200}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="user-password">Temporary password</label>
        <input
          id="user-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={MIN_PASSWORD}
          maxLength={200}
          required
          aria-describedby="user-password-hint"
        />
        <span className="hint" id="user-password-hint">
          At least {MIN_PASSWORD} characters. Share it privately.
        </span>
      </div>
      <div className="field">
        <label htmlFor="user-role">Role</label>
        <RoleSelect id="user-role" value={role} onChange={setRole} />
      </div>
      <button type="submit" disabled={action.pending}>
        Create admin user
      </button>
    </form>
  );
}

export function EditUserForm({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const action = useAction();
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<AdminRole>(user.role);
  const [isActive, setIsActive] = useState(user.isActive);

  return (
    <form
      className="panel stack"
      aria-labelledby="edit-user-heading"
      onSubmit={(e) => {
        e.preventDefault();
        // Only what changed, so a stale form never quietly undoes someone else's edit.
        const body = {
          ...(name.trim() !== user.name ? { name: name.trim() } : {}),
          ...(role !== user.role ? { role } : {}),
          ...(isActive !== user.isActive ? { isActive } : {}),
        };
        if (Object.keys(body).length === 0) {
          action.setError('Nothing has changed.');
          return;
        }
        if (body.isActive === false && !window.confirm(`Deactivate ${user.email}? They are signed out everywhere.`)) {
          return;
        }
        void action.run(() => bff(`/admin/users/${user.id}`, { method: 'PATCH', body }), { success: 'Saved.' });
      }}
    >
      <h2 id="edit-user-heading">Details</h2>
      <FormStatus error={action.error} message={action.message} />
      <div className="field">
        <label htmlFor="edit-name">Name</label>
        <input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={120} required />
      </div>
      <div className="field">
        <label htmlFor="edit-role">Role</label>
        <RoleSelect id="edit-role" value={role} onChange={setRole} />
        {isSelf ? <span className="hint">Changing your own role takes effect when your session next refreshes.</span> : null}
      </div>
      <label className="check" htmlFor="edit-active">
        <input id="edit-active" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Active (can sign in)
      </label>
      <button type="submit" disabled={action.pending}>
        Save changes
      </button>
    </form>
  );
}

export function ResetPasswordForm({ user }: { user: AdminUser }) {
  const action = useAction();
  const [password, setPassword] = useState('');

  return (
    <form
      className="panel stack"
      aria-labelledby="reset-heading"
      onSubmit={async (e) => {
        e.preventDefault();
        if (password.length < MIN_PASSWORD) {
          action.setError(`The password must be at least ${MIN_PASSWORD} characters.`);
          return;
        }
        if (!window.confirm(`Set a new password for ${user.email}? They are signed out everywhere.`)) return;
        const result = await action.run(
          () => bff(`/admin/users/${user.id}`, { method: 'PATCH', body: { password } }),
          { success: 'Password changed. Existing sessions were signed out.' },
        );
        if (result) setPassword('');
      }}
    >
      <h2 id="reset-heading">Reset password</h2>
      <FormStatus error={action.error} message={action.message} />
      <div className="field">
        <label htmlFor="reset-password">New password</label>
        <input
          id="reset-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={MIN_PASSWORD}
          maxLength={200}
          required
        />
      </div>
      <button type="submit" className="secondary" disabled={action.pending}>
        Set new password
      </button>
    </form>
  );
}
