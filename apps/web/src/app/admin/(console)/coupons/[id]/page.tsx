import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NoAccess } from '@/components/admin/NoAccess';
import { ActionButton } from '@/components/admin/ops/ActionButton';
import { ActivePill } from '@/components/admin/ops/ActivePill';
import { Notice } from '@/components/ui';
import { canAccess, currentAdmin } from '@/lib/admin';
import type { Coupon } from '@/lib/api/admin-ops-types';
import { sessionApiOrNull } from '@/lib/api/server';
import { pkr } from '@/lib/format';
import { CouponForm } from '../CouponForm';
import { couponScope, couponValue } from '../describe';

export const metadata = { title: 'Coupon' };

export default async function CouponPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'coupons')) return <NoAccess section="coupons" />;

  const { id } = await params;
  const { created } = await searchParams;
  const result = await sessionApiOrNull<Coupon>(`/admin/coupons/${encodeURIComponent(id)}`, { session: 'admin' });
  if (!result) notFound();
  const coupon = result.data;

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <p className="small" style={{ margin: 0 }}>
            <Link href="/admin/coupons">← Coupons</Link>
          </p>
          <h1 data-testid="coupon-code">{coupon.code}</h1>
          <div className="row">
            <ActivePill active={coupon.isActive} />
            <span className="muted small">
              {couponValue(coupon)} · {couponScope(coupon)}
            </span>
          </div>
        </div>
        <div className="row">
          <ActionButton
            label={coupon.isActive ? 'Deactivate' : 'Activate'}
            path={`/admin/coupons/${coupon.id}`}
            method="PATCH"
            body={{ isActive: !coupon.isActive }}
            variant="secondary"
          />
          <ActionButton
            label="Delete coupon"
            path={`/admin/coupons/${coupon.id}`}
            method="DELETE"
            variant="danger"
            confirm={`Delete coupon ${coupon.code}? This cannot be undone.`}
            redirectTo="/admin/coupons"
          />
        </div>
      </div>
      {created ? <Notice tone="ok">Coupon created.</Notice> : null}

      <div className="stat-grid">
        <div className="stat">
          <div className="muted small">Times used</div>
          <div className="value">
            {coupon.timesUsed}
            {coupon.usageLimit ? <span className="muted small"> of {coupon.usageLimit}</span> : null}
          </div>
        </div>
        <div className="stat">
          <div className="muted small">Discount given</div>
          <div className="value">{pkr(coupon.totalDiscount ?? '0.00')}</div>
        </div>
      </div>

      <CouponForm coupon={coupon} />
    </div>
  );
}
