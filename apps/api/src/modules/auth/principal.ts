import { UserRole } from '@fakhri/prisma';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AppError } from '@fakhri/shared';

export type PrincipalType = 'ADMIN' | 'CUSTOMER';

export interface Principal {
  type: PrincipalType;
  id: string;
  /** Admins only. */
  role?: UserRole;
}

export interface AuthenticatedRequest extends Request {
  principal?: Principal;
}

/** Caller metadata recorded on refresh tokens and audit rows. */
export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

export const ReqContext = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestContext => {
  const request = ctx.switchToHttp().getRequest<Request>();
  return { ip: request.ip, userAgent: request.get('user-agent') ?? undefined };
});

/** Injects the authenticated principal. Throws if the route is not behind auth. */
export const CurrentPrincipal = createParamDecorator((_data: unknown, ctx: ExecutionContext): Principal => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.principal) throw new AppError('UNAUTHENTICATED', 'Authentication required');
  return request.principal;
});

/** Injects the authenticated customer id. */
export const CurrentCustomer = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (request.principal?.type !== 'CUSTOMER') throw new AppError('FORBIDDEN', 'Customer account required');
  return request.principal.id;
});
