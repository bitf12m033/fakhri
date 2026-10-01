import Link from 'next/link';
import { NoAccess } from '@/components/admin/NoAccess';
import { canAccess, currentAdmin } from '@/lib/admin';
import { PageForm } from '../../PageForm';

export const metadata = { title: 'New page' };

export default async function NewContentPage() {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'content')) return <NoAccess section="content" />;

  return (
    <div className="stack">
      <div>
        <p className="small" style={{ margin: 0 }}>
          <Link href="/admin/content">← Content</Link>
        </p>
        <h1>New page</h1>
      </div>
      <PageForm />
    </div>
  );
}
