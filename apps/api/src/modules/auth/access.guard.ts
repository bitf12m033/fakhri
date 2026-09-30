import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@fakhri/prisma';
import { AppError } from '@fakhri/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { currentActor } from '../../common/actor-context';
import { CUSTOMER_KEY, OPTIONAL_KEY, PUBLIC_KEY, ROLES_KEY } from './auth.decorators';
import { AuthenticatedRequest, Principal } from './principal';
import { TokenService } from './token.service';

/**
 * Single gate for authentication and authorization (REQ-29). A route is reachable
 * only if it declares how: @Public, @OptionalAuth, @Roles(...) for admins, or
 * @CustomerRoute. Anything undeclared is denied, so a new admin route cannot ship
 * open by accident.
 *
 * Admin requests re-read the account so deactivation and role changes take effect
 * immediately; customer requests trust the 15-minute access token to stay cheap.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (this.reflector.getAllAndOverride<boolean>(OPTIONAL_KEY, targets)) {
      await this.attachIfPresent(request);
      return true;
    }

    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, targets);
    const customerRoute = this.reflector.getAllAndOverride<boolean>(CUSTOMER_KEY, targets) ?? false;
    if (roles === undefined && !customerRoute) {
      throw new AppError('FORBIDDEN', 'Route declares no access policy');
    }

    const token = bearerToken(request.headers.authorization);
    if (!token) throw new AppError('UNAUTHENTICATED', 'Authentication required');
    const principal = await this.tokens.verifyAccess(token);

    const resolved = customerRoute
      ? this.authorizeCustomer(principal)
      : await this.authorizeAdmin(principal, roles ?? []);

    request.principal = resolved;
    const actor = currentActor();
    if (actor) actor.principal = resolved;
    return true;
  }

  /**
   * Identify the caller when they offer a token, stay anonymous when they do not.
   * A token that is present but invalid is still an error: silently downgrading
   * to anonymous would hide an expired session behind a guest cart.
   */
  private async attachIfPresent(request: AuthenticatedRequest): Promise<void> {
    const token = bearerToken(request.headers.authorization);
    if (!token) return;
    const principal = await this.tokens.verifyAccess(token);
    request.principal = principal;
    const actor = currentActor();
    if (actor) actor.principal = principal;
  }

  private authorizeCustomer(principal: Principal): Principal {
    if (principal.type !== 'CUSTOMER') throw new AppError('FORBIDDEN', 'Customer account required');
    return principal;
  }

  private async authorizeAdmin(principal: Principal, roles: UserRole[]): Promise<Principal> {
    if (principal.type !== 'ADMIN') throw new AppError('FORBIDDEN', 'Admin account required');
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: principal.id },
      select: { role: true, isActive: true },
    });
    if (!admin || !admin.isActive) throw new AppError('UNAUTHENTICATED', 'Invalid or expired credentials');
    if (roles.length > 0 && admin.role !== UserRole.SUPER_ADMIN && !roles.includes(admin.role)) {
      throw new AppError('FORBIDDEN', 'Your role cannot perform this action', { required: roles });
    }
    return { ...principal, role: admin.role };
  }
}

function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, value] = header.split(' ');
  if (!value || scheme?.toLowerCase() !== 'bearer') return undefined;
  return value.trim() || undefined;
}
