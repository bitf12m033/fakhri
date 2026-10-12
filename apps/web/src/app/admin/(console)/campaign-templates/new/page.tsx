import Link from 'next/link';
import { NoAccess } from '@/components/admin/NoAccess';
import { SubNav } from '@/components/admin/ops/SubNav';
import { canAccess, currentAdmin } from '@/lib/admin';
import { CAMPAIGN_LINKS } from '../../campaigns/links';
import { TemplateForm } from './TemplateForm';

export const metadata = { title: 'New template' };

export default async function NewTemplatePage() {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'campaigns')) return <NoAccess section="campaigns" />;

  return (
    <div className="stack">
      <div>
        <p className="small" style={{ margin: 0 }}>
          <Link href="/admin/campaign-templates">← Templates</Link>
        </p>
        <h1>New template</h1>
      </div>
      <SubNav links={CAMPAIGN_LINKS} current="/admin/campaign-templates" />
      <TemplateForm />
    </div>
  );
}
