import Link from 'next/link';
import { NoAccess } from '@/components/admin/NoAccess';
import { canAccess, currentAdmin } from '@/lib/admin';
import { BannerForm } from '../../BannerForm';

export const metadata = { title: 'New banner' };

export default async function NewBannerPage() {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'content')) return <NoAccess section="content" />;

  return (
    <div className="stack">
      <div>
        <p className="small" style={{ margin: 0 }}>
          <Link href="/admin/content/banners">← Banners</Link>
        </p>
        <h1>New banner</h1>
      </div>
      <BannerForm />
    </div>
  );
}
