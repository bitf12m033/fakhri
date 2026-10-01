import Link from 'next/link';
import { NoAccess } from '@/components/admin/NoAccess';
import { canAccess, currentAdmin } from '@/lib/admin';
import { CouponForm } from '../CouponForm';

export const metadata = { title: 'New coupon' };

export default async function NewCouponPage() {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'coupons')) return <NoAccess section="coupons" />;

  return (
    <div className="stack">
      <div>
        <p className="small" style={{ margin: 0 }}>
          <Link href="/admin/coupons">← Coupons</Link>
        </p>
        <h1>New coupon</h1>
      </div>
      <CouponForm defaultStart={new Date().toISOString()} />
    </div>
  );
}
