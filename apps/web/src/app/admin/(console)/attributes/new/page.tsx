import Link from 'next/link';
import { AttributeForm } from '@/components/admin/catalog/AttributeForm';
import { NoAccess } from '@/components/admin/NoAccess';
import { canAccess, currentAdmin } from '@/lib/admin';

export const metadata = { title: 'New attribute' };

export default async function NewAttributePage() {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'attributes')) return <NoAccess section="attributes" />;

  return (
    <div className="stack">
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/attributes">← Attributes</Link>
      </p>
      <h1>New attribute</h1>
      <p className="muted small" style={{ margin: 0 }}>
        For a choice attribute, create it first, then add its options on the next page.
      </p>
      <AttributeForm />
    </div>
  );
}
