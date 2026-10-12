import { NoAccess } from '@/components/admin/NoAccess';
import { SubNav } from '@/components/admin/ops/SubNav';
import { canAccess, currentAdmin } from '@/lib/admin';
import { ImportForm } from './ImportForm';
import { LEAD_LINKS } from '../links';

export const metadata = { title: 'Import leads' };

export default async function ImportLeadsPage() {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'leads')) return <NoAccess section="leads" />;

  return (
    <div className="stack">
      <h1>Import leads</h1>
      <SubNav links={LEAD_LINKS} current="/admin/leads/import" />
      <p className="muted small">
        Preview checks the file and writes nothing. Save runs only when every phone number is valid. Consent stays “not asked”.
      </p>
      <ImportForm />
    </div>
  );
}
