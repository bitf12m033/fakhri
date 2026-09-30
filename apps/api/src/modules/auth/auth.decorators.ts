import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@fakhri/prisma';

export const PUBLIC_KEY = 'auth:public';
export const ROLES_KEY = 'auth:roles';
export const CUSTOMER_KEY = 'auth:customer';
export const OPTIONAL_KEY = 'auth:optional';
export const RATE_LIMIT_KEY = 'auth:rate-limit';

/** No authentication. Storefront reads and health only. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/**
 * Admin route. SUPER_ADMIN passes every check; listing no role means
 * "any authenticated admin". Routes with neither @Public, @Roles nor
 * @CustomerRoute are denied (REQ-29 default deny).
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** Customer-account route (`/customers/me/**`). */
export const CustomerRoute = () => SetMetadata(CUSTOMER_KEY, true);

/**
 * Open to anonymous callers, but a bearer token is still honoured when present.
 * Cart and checkout need this: the same route serves guests and signed-in customers.
 */
export const OptionalAuth = () => SetMetadata(OPTIONAL_KEY, true);

export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
  /** Also bucket by this body field, e.g. `phone`, so one IP cannot brute force many accounts. */
  bodyKey?: string;
  /** Env override for `limit`, so operators can tighten a route without a deploy. */
  configKey?: 'RATE_LIMIT_AUTH_PER_MINUTE' | 'OTP_REQUESTS_PER_HOUR';
}

/** Per-route Redis rate limit (FR-45). */
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);
