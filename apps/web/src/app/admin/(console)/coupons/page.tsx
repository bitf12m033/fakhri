import Link from 'next/link';
import { NoAccess } from '@/components/admin/NoAccess';
import { ActionButton } from '@/components/admin/ops/ActionButton';
import { ActivePill } from '@/components/admin/ops/ActivePill';
import { Pagination } from '@/components/ui';
import { canAccess, currentAdmin } from '@/lib/admin';
import type { Coupon } from '@/lib/api/admin-ops-types';
import { sessionApi } from '@/lib/api/server';
import type { PaginationMeta } from '@/lib/api/types';
import { day, pkr } from '@/lib/format';
import { couponScope, couponValue } from './describe';

export const metadata = { title: 'Coupons' };

type Search = { q?: string; isActive?: string; page?: string };

export default async function CouponsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'coupons')) return <NoAccess section="coupons" />;

  const search = await searchParams;
  const query = new URLSearchParams();
  if (search.q?.trim()) query.set('q', search.q.trim());
  if (search.isActive === 'true' || search.isActive === 'false') query.set('isActive', search.isActive);
  query.set('page', search.page ?? '1');
  query.set('pageSize', '25');

  const { data: coupons, meta } = await sessionApi<Coupon[], PaginationMeta>(`/admin/coupons?${query}`, {
    session: 'admin',
  });
  const hrefFor = (page: number) => {
    const next = new URLSearchParams(query);
    next.set('page', String(page));
    next.delete('pageSize');
    return `/admin/coupons?${next}`;
  };
  const now = Date.now();

  return (
    <div className="stack">
      <div className="spread">
        <h1>Coupons</h1>
        <Link href="/admin/coupons/new" className="button">
          New coupon
        </Link>
      </div>
      <form className="toolbar" method="get">
        <div className="field">
          <label htmlFor="q">Code contains</label>
          <input id="q" name="q" defaultValue={search.q ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="isActive">Status</label>
          <select id="isActive" name="isActive" defaultValue={search.isActive ?? ''}>
            <option value="">Any</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
        <button type="submit">Filter</button>
      </form>

      <p className="muted small">{meta.totalItems} coupons</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Discount</th>
              <th>Applies to</th>
              <th className="num">Min. order</th>
              <th className="num">Used</th>
              <th>Valid</th>
              <th>Status</th>
              <th>
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((coupon) => {
              const expired = coupon.validTo !== null && new Date(coupon.validTo).getTime() < now;
              const upcoming = new Date(coupon.validFrom).getTime() > now;
              return (
                <tr key={coupon.id} data-testid="coupon-row">
                  <td>
                    <Link href={`/admin/coupons/${coupon.id}`}>
                      <code>{coupon.code}</code>
                    </Link>
                  </td>
                  <td>{couponValue(coupon)}</td>
                  <td>{couponScope(coupon)}</td>
                  <td className="num">{coupon.minOrderValue ? pkr(coupon.minOrderValue) : '—'}</td>
                  <td className="num">
                    {coupon.timesUsed}
                    {coupon.usageLimit ? ` / ${coupon.usageLimit}` : ''}
                    {coupon.perCustomerLimit ? (
                      <div className="muted small">{coupon.perCustomerLimit} per customer</div>
                    ) : null}
                  </td>
                  <td className="small">
                    {day(coupon.validFrom)} – {coupon.validTo ? day(coupon.validTo) : 'no end'}
                    {expired ? <div className="muted">ended</div> : upcoming ? <div className="muted">not started</div> : null}
                  </td>
                  <td>
                    <ActivePill active={coupon.isActive} />
                  </td>
                  <td>
                    <div className="row" style={{ gap: '0.4rem', alignItems: 'start' }}>
                      <Link href={`/admin/coupons/${coupon.id}`} className="button secondary small">
                        Edit
                      </Link>
                      <ActionButton
                        label={coupon.isActive ? 'Deactivate' : 'Activate'}
                        path={`/admin/coupons/${coupon.id}`}
                        method="PATCH"
                        body={{ isActive: !coupon.isActive }}
                        variant="secondary"
                        testId="coupon-toggle"
                      />
                      <ActionButton
                        label="Delete"
                        path={`/admin/coupons/${coupon.id}`}
                        method="DELETE"
                        variant="danger"
                        confirm={`Delete coupon ${coupon.code}? This cannot be undone.`}
                        testId="coupon-delete"
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
            {coupons.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted">
                  No coupons match.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="small muted">A coupon that has been redeemed cannot be deleted; deactivate it instead.</p>
      <Pagination page={meta.page} totalPages={meta.totalPages} hrefFor={hrefFor} />
    </div>
  );
}
