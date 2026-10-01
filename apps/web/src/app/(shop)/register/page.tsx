import Link from 'next/link';
import { safeNext } from '@/lib/next-path';
import { RegisterForm } from './RegisterForm';

export const metadata = { title: 'Create an account', robots: { index: false } };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const target = safeNext(next);
  return (
    <div className="panel stack" style={{ maxWidth: 520, margin: '0 auto' }}>
      <h1>Create an account</h1>
      <RegisterForm next={target} />
      <p className="small" style={{ margin: 0 }}>
        Already registered? <Link href={`/login?next=${encodeURIComponent(target)}`}>Sign in</Link>
      </p>
    </div>
  );
}
