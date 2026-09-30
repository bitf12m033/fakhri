import type { Request } from 'express';

/** Extract the pino request-id (set by pino-http) for error payloads/log correlation. */
export function traceIdOf(req: Request): string {
  const id = (req as Request & { id?: string }).id;
  return id ?? 'no-id';
}