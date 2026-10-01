import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AttributeForm } from '@/components/admin/catalog/AttributeForm';
import { DeleteButton } from '@/components/admin/catalog/DeleteButton';
import { OptionsEditor } from '@/components/admin/catalog/OptionsEditor';
import { NoAccess } from '@/components/admin/NoAccess';
import { canAccess, currentAdmin } from '@/lib/admin';
import type { AdminAttribute } from '@/lib/api/admin-catalog-types';
import { sessionApiOrNull } from '@/lib/api/server';

export const metadata = { title: 'Attribute' };

export default async function AdminAttributePage({ params }: { params: Promise<{ id: string }> }) {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'attributes')) return <NoAccess section="attributes" />;

  const { id } = await params;
  const result = await sessionApiOrNull<AdminAttribute>(`/admin/attributes/${encodeURIComponent(id)}`, {
    session: 'admin',
  });
  if (!result) notFound();
  const attribute = result.data;

  return (
    <div className="stack">
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/attributes">← Attributes</Link>
      </p>
      <h1>{attribute.name}</h1>
      <AttributeForm attribute={attribute} />
      {attribute.type === 'OPTION' ? <OptionsEditor attributeId={attribute.id} options={attribute.options} /> : null}
      <div className="panel stack">
        <h2>Delete attribute</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Only possible while no category binds it and no product has a value for it.
        </p>
        <DeleteButton
          path={`/admin/attributes/${attribute.id}`}
          confirmText={`Delete the attribute "${attribute.name}"? This cannot be undone.`}
          label="Delete attribute"
          redirectTo="/admin/attributes"
        />
      </div>
    </div>
  );
}
