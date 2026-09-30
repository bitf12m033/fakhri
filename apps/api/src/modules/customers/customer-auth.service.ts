import { Injectable } from '@nestjs/common';
import { AppError, conflict, invalidInput } from '@fakhri/shared';
import { Prisma } from '@fakhri/prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { LockoutService } from '../auth/lockout.service';
import { PasswordService } from '../auth/password.service';
import { Principal, RequestContext } from '../auth/principal';
import { TokenPair, TokenService } from '../auth/token.service';
import {
  CustomerLoginDto,
  CustomerRegisterDto,
  OtpRequestDto,
  OtpVerifyDto,
  SetPasswordDto,
} from './customer.dto';
import { OtpChallenge, OtpService } from './otp.service';
import { normalizePhone } from './phone';

const invalidCredentials = () => new AppError('UNAUTHENTICATED', 'Invalid phone or password');

const ACTIVE = 'ACTIVE';

/** Customer registration, password login and phone OTP login (REQ-12/13). */
@Injectable()
export class CustomerAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly lockout: LockoutService,
    private readonly otp: OtpService,
    private readonly audit: AuditService,
  ) {}

  async register(dto: CustomerRegisterDto, context: RequestContext): Promise<TokenPair> {
    const phone = normalizePhone(dto.phone);
    const email = dto.email?.trim().toLowerCase();
    const passwordHash = await this.passwords.hash(dto.password);

    const customer = await this.prisma.customer
      .create({
        data: {
          phone,
          email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          whatsappConsent: dto.whatsappConsent ?? false,
        },
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const target = String(error.meta?.target ?? '');
          throw conflict(target.includes('email') ? 'Email is already in use' : 'Phone number is already registered');
        }
        throw error;
      });

    await this.audit.log({
      actorType: 'CUSTOMER',
      actorId: customer.id,
      action: 'auth.customer.register',
      entityType: 'Customer',
      entityId: customer.id,
    });
    return this.tokens.issue({ type: 'CUSTOMER', id: customer.id }, context);
  }

  async login(dto: CustomerLoginDto, context: RequestContext): Promise<TokenPair> {
    const phone = normalizePhone(dto.phone);
    const subject = `customer:${phone}`;
    await this.lockout.assertNotLocked(subject);

    const customer = await this.prisma.customer.findUnique({ where: { phone } });
    const matches = await this.passwords.verifyOrDecoy(customer?.passwordHash, dto.password);
    if (!customer || customer.status !== ACTIVE || !matches) {
      await this.lockout.recordFailure(subject);
      throw invalidCredentials();
    }

    await this.lockout.clear(subject);
    await this.prisma.customer.update({ where: { id: customer.id }, data: { lastLoginAt: new Date() } });
    return this.tokens.issue({ type: 'CUSTOMER', id: customer.id }, context);
  }

  /** Issues a code for any well-formed number, so the response cannot enumerate accounts. */
  async requestOtp(dto: OtpRequestDto): Promise<OtpChallenge> {
    return this.otp.issue(normalizePhone(dto.phone));
  }

  /**
   * OTP is the primary channel for this market (DEC-08), so a verified code for
   * an unknown number creates the account. The phone is verified by definition.
   */
  async verifyOtp(dto: OtpVerifyDto, context: RequestContext): Promise<TokenPair> {
    const phone = normalizePhone(dto.phone);
    await this.otp.consume(phone, dto.code);

    const existing = await this.prisma.customer.findUnique({ where: { phone } });
    if (existing && existing.status !== ACTIVE) throw new AppError('FORBIDDEN', 'This account is not active');

    const customer =
      existing ??
      (await this.prisma.customer.create({ data: { phone, isPhoneVerified: true } }));
    await this.prisma.customer.update({
      where: { id: customer.id },
      data: { isPhoneVerified: true, lastLoginAt: new Date() },
    });
    await this.lockout.clear(`customer:${phone}`);
    if (!existing) {
      await this.audit.log({
        actorType: 'CUSTOMER',
        actorId: customer.id,
        action: 'auth.customer.register_via_otp',
        entityType: 'Customer',
        entityId: customer.id,
      });
    }
    return this.tokens.issue({ type: 'CUSTOMER', id: customer.id }, context);
  }

  /**
   * Sets or changes the password. An OTP-only account may set one without proving
   * a previous password, which is also the recovery path after a forgotten one.
   * Every existing session is dropped and the caller gets a fresh pair.
   */
  async setPassword(customerId: string, dto: SetPasswordDto, context: RequestContext): Promise<TokenPair> {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new AppError('NOT_FOUND', 'Customer not found');

    if (customer.passwordHash) {
      if (!dto.currentPassword) throw invalidInput('Current password is required');
      if (!(await this.passwords.verify(customer.passwordHash, dto.currentPassword))) {
        throw new AppError('UNAUTHENTICATED', 'Current password is incorrect');
      }
    }

    const passwordHash = await this.passwords.hash(dto.newPassword);
    await this.prisma.customer.update({ where: { id: customerId }, data: { passwordHash } });
    await this.tokens.revokeAllFor({ type: 'CUSTOMER', id: customerId });
    await this.audit.log({
      actorType: 'CUSTOMER',
      actorId: customerId,
      action: 'auth.customer.set_password',
      entityType: 'Customer',
      entityId: customerId,
    });
    return this.tokens.issue({ type: 'CUSTOMER', id: customerId }, context);
  }

  async refresh(refreshToken: string, context: RequestContext): Promise<TokenPair> {
    const { pair, principal } = await this.tokens.rotate(refreshToken, context);
    if (principal.type !== 'CUSTOMER') throw invalidCredentials();
    return pair;
  }

  async logout(refreshToken: string): Promise<{ ok: true }> {
    await this.tokens.revoke(refreshToken);
    return { ok: true };
  }

  /** Signs the customer out everywhere: used after a password change. */
  async revokeAll(principal: Principal): Promise<void> {
    await this.tokens.revokeAllFor(principal);
  }
}
