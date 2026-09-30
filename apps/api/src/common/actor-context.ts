import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

/** Who is acting, as far as the audit log cares. Structurally a Principal. */
export interface ActorIdentity {
  type: 'ADMIN' | 'CUSTOMER';
  id: string;
}

export interface ActorContext {
  principal?: ActorIdentity;
  ip?: string;
  userAgent?: string;
}

const storage = new AsyncLocalStorage<ActorContext>();

/**
 * Per-request actor, so audit rows can record who did something without every
 * service signature carrying a principal (REQ-34). The middleware opens the store
 * with the request metadata; the access guard fills in the principal once known.
 */
export function actorContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  storage.run({ ip: req.ip, userAgent: req.get('user-agent') ?? undefined }, next);
}

export function currentActor(): ActorContext | undefined {
  return storage.getStore();
}
