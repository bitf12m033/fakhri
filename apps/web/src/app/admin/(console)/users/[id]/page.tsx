import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NoAccess } from '@/components/admin/NoAccess';
import { ActionButton } from '@/components/admin/ops/ActionButton';
import { ActivePill } from '@/components/admin/ops/ActivePill';
import { Notice } from '@/components/ui';
import { canAccess, currentAdmin } from '@/lib/admin';
import type { AdminUser } from '@/lib/api/admin-ops-types';
import { sessionApiOrNull } from '@/lib/api/server';
import { dateTime } from '@/lib/format';
import { EditUserForm, ResetPasswordForm } from '../UserForms';

export const metadata = { title: 'Admin user' };

export default async function AdminUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'users')) return <NoAccess section="users" />;

  const { id } = await params;
  const { created } = await searchParams;
  const result = await sessionApiOrNull<AdminUser>(`/admin/users/${encodeURIComponent(id)}`, { session: 'admin' });
  if (!result) notFound();
  const user = result.data;
  const isSelf = user.id === admin.id;

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <p className="small" style={{ margin: 0 }}>
            <Link href="/admin/users">← Admin users</Link>
          </p>
          <h1>
            {user.name}
            {isSelf ? <span className="muted small"> (you)</span> : null}
          </h1>
          <div className="row">
            <ActivePill active={user.isActive} />
            <span className="muted small">
              {user.email} · created {dateTime(user.createdAt)} · last sign-in{' '}
              {user.lastLoginAt ? dateTime(user.lastLoginAt) : 'never'}
            </span>
          </div>
        </div>
        {isSelf ? null : (
          <ActionButton
            label="Delete user"
            path={`/admin/users/${user.id}`}
            method="DELETE"
            variant="danger"
            confirm={`Delete ${user.email}? This cannot be undone; deactivating keeps the account.`}
            redirectTo="/admin/users"
          />
        )}
      </div>
      {created ? <Notice tone="ok">Admin user created. They can sign in now.</Notice> : null}
      <div className="two-col">
        <EditUserForm user={user} isSelf={isSelf} />
        <ResetPasswordForm user={user} />
      </div>
    </div>
  );
}
