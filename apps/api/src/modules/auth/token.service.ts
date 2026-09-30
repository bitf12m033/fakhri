import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AppConfig } from '@fakhri/config';
import { AppError } from '@fakhri/shared';
import { Prisma, UserRole } from '@fakhri/prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { Principal, PrincipalType, RequestContext } from './principal';

export type { RequestContext };

export interface TokenPair {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: string;
}

interface AccessClaims {
  sub: string;
  typ: PrincipalType;
  role?: UserRole;
  iss?: string;
}

const unauthenticated = () => new AppError('UNAUTHENTICATED', 'Invalid or expired credentials');

/**
 * Access tokens are short-lived signed JWTs; refresh tokens are opaque random
 * strings stored only as a SHA-256 hash and rotated on every use (REQ-12).
 * Presenting an already-rotated token revokes the whole family, which is the
 * standard response to a stolen refresh token.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
  ) {}

  async issue(principal: Principal, context: RequestContext = {}): Promise<TokenPair> {
    const accessToken = await this.signAccess(principal);
    const refresh = await this.createRefresh(principal, context);
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTtlSeconds(),
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt.toISOString(),
    };
  }

  /** Verify a bearer token. Never touches the database. */
  async verifyAccess(token: string): Promise<Principal> {
    let claims: AccessClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessClaims>(token, {
        algorithms: ['HS256'],
        issuer: this.config.get('JWT_ISSUER', { infer: true }),
      });
    } catch {
      throw unauthenticated();
    }
    if (!claims.sub || (claims.typ !== 'ADMIN' && claims.typ !== 'CUSTOMER')) throw unauthenticated();
    return { type: claims.typ, id: claims.sub, role: claims.role };
  }

  /** Rotate: revoke the presented token and return a fresh pair for the same subject. */
  async rotate(presented: string, context: RequestContext = {}): Promise<{ pair: TokenPair; principal: Principal }> {
    const tokenHash = hashToken(presented);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: { select: { id: true, role: true, isActive: true } },
        customer: { select: { id: true, status: true } },
      },
    });
    if (!existing) throw unauthenticated();

    if (existing.revokedAt) {
      // Reuse of a rotated token: assume theft and drop every token for the subject.
      await this.revokeFamily(existing.userId, existing.customerId);
      throw unauthenticated();
    }
    if (existing.expiresAt.getTime() <= Date.now()) throw unauthenticated();

    const principal = this.principalOf(existing);
    const next = await this.prisma.$transaction(async (tx) => {
      const created = await this.createRefresh(principal, context, tx);
      await tx.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date(), replacedByTokenId: created.id },
      });
      return created;
    });

    return {
      principal,
      pair: {
        accessToken: await this.signAccess(principal),
        tokenType: 'Bearer',
        expiresIn: this.accessTtlSeconds(),
        refreshToken: next.token,
        refreshExpiresAt: next.expiresAt.toISOString(),
      },
    };
  }

  /** Logout. Unknown or already-revoked tokens are accepted silently. */
  async revoke(presented: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(presented), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllFor(principal: Principal): Promise<void> {
    await this.revokeFamily(
      principal.type === 'ADMIN' ? principal.id : null,
      principal.type === 'CUSTOMER' ? principal.id : null,
    );
  }

  private principalOf(row: {
    user: { id: string; role: UserRole; isActive: boolean } | null;
    customer: { id: string; status: string } | null;
  }): Principal {
    if (row.user) {
      if (!row.user.isActive) throw unauthenticated();
      return { type: 'ADMIN', id: row.user.id, role: row.user.role };
    }
    if (row.customer) {
      if (row.customer.status !== 'ACTIVE') throw unauthenticated();
      return { type: 'CUSTOMER', id: row.customer.id };
    }
    throw unauthenticated();
  }

  private async signAccess(principal: Principal): Promise<string> {
    return this.jwt.signAsync(
      { sub: principal.id, typ: principal.type, role: principal.role },
      {
        algorithm: 'HS256',
        issuer: this.config.get('JWT_ISSUER', { infer: true }),
        expiresIn: this.accessTtlSeconds(),
      },
    );
  }

  private async createRefresh(
    principal: Principal,
    context: RequestContext,
    tx?: Prisma.TransactionClient,
  ): Promise<{ id: string; token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + this.config.get('JWT_REFRESH_TTL_DAYS', { infer: true }) * 24 * 60 * 60 * 1000,
    );
    const db = tx ?? this.prisma;
    const created = await db.refreshToken.create({
      data: {
        tokenHash: hashToken(token),
        userId: principal.type === 'ADMIN' ? principal.id : null,
        customerId: principal.type === 'CUSTOMER' ? principal.id : null,
        expiresAt,
        ip: context.ip?.slice(0, 64),
        userAgent: context.userAgent?.slice(0, 256),
      },
      select: { id: true },
    });
    return { id: created.id, token, expiresAt };
  }

  private async revokeFamily(userId: string | null, customerId: string | null): Promise<void> {
    if (!userId && !customerId) return;
    await this.prisma.refreshToken.updateMany({
      where: { ...(userId ? { userId } : { customerId }), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private accessTtlSeconds(): number {
    return this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
  }
}

/** Refresh tokens are never stored in the clear. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
