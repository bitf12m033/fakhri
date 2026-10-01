import Link from 'next/link';
import { NoAccess } from '@/components/admin/NoAccess';
import { ActivePill } from '@/components/admin/ops/ActivePill';
import { Pagination } from '@/components/ui';
import { canAccess, currentAdmin } from '@/lib/admin';
import type { AdminUser } from '@/lib/api/admin-ops-types';
import { sessionApi } from '@/lib/api/server';
import type { PaginationMeta } from '@/lib/api/types';
import { dateTime } from '@/lib/format';
import { CreateUserForm } from './UserForms';

export const metadata = { title: 'Admin users' };

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'users')) return <NoAccess section="users" />;

  const { page } = await searchParams;
  const query = new URLSearchParams({ page: page ?? '1', pageSize: '50' });
  const { data: users, meta } = await sessionApi<AdminUser[], PaginationMeta>(`/admin/users?${query}`, {
    session: 'admin',
  });

  return (
    <div className="stack">
      <h1>Admin users</h1>
      <div className="two-col">
        <div className="stack">
          <p className="muted small" style={{ margin: 0 }}>
            {meta.totalItems} accounts. The last active super admin cannot be demoted, deactivated or deleted.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last sign-in</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} data-testid="admin-user-row">
                    <td>
                      <Link href={`/admin/users/${user.id}`}>{user.name}</Link>
                      {user.id === admin.id ? <span className="muted small"> (you)</span> : null}
                    </td>
                    <td>{user.email}</td>
                    <td>{user.role.replaceAll('_', ' ').toLowerCase()}</td>
                    <td>
                      <ActivePill active={user.isActive} />
                    </td>
                    <td className="small">{user.lastLoginAt ? dateTime(user.lastLoginAt) : 'Never'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={meta.page} totalPages={meta.totalPages} hrefFor={(p) => `/admin/users?page=${p}`} />
        </div>
        <CreateUserForm />
      </div>
    </div>
  );
}
