import { Injectable } from '@nestjs/common';
import { AppError } from '@fakhri/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AdminLoginDto, RefreshTokenDto } from './auth.dto';
import { LockoutService } from './lockout.service';
import { PasswordService } from './password.service';
import { RequestContext, TokenPair, TokenService } from './token.service';

const invalidCredentials = () => new AppError('UNAUTHENTICATED', 'Invalid email or password');

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly lockout: LockoutService,
    private readonly audit: AuditService,
  ) {}

  /** REQ-29. The response never says whether the email exists. */
  async login(dto: AdminLoginDto, context: RequestContext): Promise<TokenPair> {
    const email = dto.email.trim().toLowerCase();
    const subject = `admin:${email}`;
    await this.lockout.assertNotLocked(subject);

    const admin = await this.prisma.adminUser.findUnique({ where: { email } });
    const matches = await this.passwords.verifyOrDecoy(admin?.passwordHash, dto.password);
    if (!admin || !admin.isActive || !matches) {
      await this.lockout.recordFailure(subject);
      throw invalidCredentials();
    }

    await this.lockout.clear(subject);
    await this.prisma.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({
      actorType: 'ADMIN',
      actorId: admin.id,
      action: 'auth.admin.login',
      entityType: 'AdminUser',
      entityId: admin.id,
    });
    return this.tokens.issue({ type: 'ADMIN', id: admin.id, role: admin.role }, context);
  }

  async refresh(dto: RefreshTokenDto, context: RequestContext): Promise<TokenPair> {
    const { pair, principal } = await this.tokens.rotate(dto.refreshToken, context);
    if (principal.type !== 'ADMIN') throw invalidCredentials();
    return pair;
  }

  async logout(dto: RefreshTokenDto): Promise<{ ok: true }> {
    await this.tokens.revoke(dto.refreshToken);
    return { ok: true };
  }
}
