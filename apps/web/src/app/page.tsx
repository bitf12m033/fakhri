import { getHealth } from '@/lib/api';
import { formatPKR, money } from '@fakhri/shared';

export const metadata = { title: 'Home' };

/** Scaffold home — a placeholder until the storefront increments (3.x). */
export default async function Home() {
  const health = await getHealth();
  return (
    <main style={{ maxWidth: 720, margin: '4rem auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Fakhri</h1>
      <p>Pakistan electronics &amp; home appliances storefront — scaffold v0.1.0.</p>

      {health ? (
        <p>
          API <strong>{health.status}</strong> v{health.version} · db{' '}
          {health.db.connected ? 'connected' : 'down'} · redis{' '}
          {health.redis.connected ? 'connected' : 'down'}
        </p>
      ) : (
        <p>API not reachable ({process.env.API_URL ?? 'http://localhost:3000'}). Start it with <code>npm run dev:api</code>.</p>
      )}

      <p>
        Money sanity: <code>{formatPKR(money('123456.78'))}</code> (exact decimal, no floats).
      </p>
    </main>
  );
}