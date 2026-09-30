export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  db: { connected: boolean };
  redis: { connected: boolean };
}

/** Minimal typed client. Expands with contracts in later increments. */
export async function getHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${process.env.API_URL ?? 'http://localhost:3000'}/health`, {
      // SSR from Next; do NOT cache a health probe
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  }
}