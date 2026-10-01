import Redis from 'ioredis';
import { adminToken, api, variantsOf } from './api';
import { ADMINS, PRODUCTS } from './env';

const MIN_AVAILABLE = 20;

/**
 * Runs once the servers are up. Two things a shared dev database accumulates
 * between runs would otherwise make journeys fail for reasons unrelated to the
 * code: exhausted rate-limit buckets (every request comes from loopback) and the
 * seeded stock that earlier runs bought.
 */
export default async function globalSetup(): Promise<void> {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { lazyConnect: true });
  await redis.connect();
  for (const pattern of ['rl:*', 'auth:*']) {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
      cursor = next;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== '0');
  }
  await redis.quit();

  const token = await adminToken(ADMINS.super);
  for (const slug of Object.values(PRODUCTS)) {
    for (const variant of await variantsOf(slug)) {
      const items = await api<{ variantId: string; warehouse: { id: string }; available: number }[]>(
        `/admin/inventory/items?variantId=${variant.id}`,
        { token },
      );
      for (const item of items) {
        if (item.available >= MIN_AVAILABLE) continue;
        await api('/admin/inventory/adjustments', {
          token,
          body: {
            warehouseId: item.warehouse.id,
            variantId: variant.id,
            quantity: MIN_AVAILABLE * 2 - item.available,
            reason: 'E2E stock top-up',
          },
        });
      }
    }
  }
}
