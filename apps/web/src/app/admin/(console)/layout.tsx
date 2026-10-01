import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { canAccess, currentAdmin, Section, SECTIONS } from '@/lib/admin';
import { AdminNav } from './AdminNav';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s | Fakhri admin' },
  robots: { index: false, follow: false },
};

export default async function AdminConsoleLayout({ children }: { children: React.ReactNode }) {
  // Middleware already redirects anonymous visitors; this covers a token without admin claims.
  const admin = await currentAdmin();
  if (!admin) redirect('/admin/login');

  const links = (Object.keys(SECTIONS) as Section[])
    .filter((section) => canAccess(admin.role, section))
    .map((section) => ({ href: SECTIONS[section].href, label: SECTIONS[section].label }));

  return (
    <div className="admin-shell">
      <AdminNav links={links} role={admin.role} />
      <main className="admin-main" id="main">
        {children}
      </main>
    </div>
  );
}
