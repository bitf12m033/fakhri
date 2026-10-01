import type { Metadata } from 'next';
import { AdminLoginForm } from './AdminLoginForm';

export const metadata: Metadata = { title: 'Admin sign in', robots: { index: false } };

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Only same-site admin paths: `next` is user-controlled.
  const target = next?.startsWith('/admin') && !next.startsWith('//') ? next : '/admin';
  return (
    <main style={{ display: 'grid', placeItems: 'center', padding: '3rem 1rem' }}>
      <div className="panel stack" style={{ width: 'min(100%, 380px)' }}>
        <h1>Fakhri admin</h1>
        <AdminLoginForm next={target} />
      </div>
    </main>
  );
}
