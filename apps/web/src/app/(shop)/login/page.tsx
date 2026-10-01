import Link from 'next/link';
import { safeNext } from '@/lib/next-path';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'Sign in', robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const target = safeNext(next);
  return (
    <div className="panel stack" style={{ maxWidth: 440, margin: '0 auto' }}>
      <h1>Sign in</h1>
      <LoginForm next={target} />
      <p className="small" style={{ margin: 0 }}>
        New here? <Link href={`/register?next=${encodeURIComponent(target)}`}>Create an account</Link>
      </p>
    </div>
  );
}
