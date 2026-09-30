import { randomInt } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '@fakhri/config';
import { AppError } from '@fakhri/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../auth/password.service';

export const OTP_PURPOSE_LOGIN = 'LOGIN';

export interface OtpChallenge {
  expiresAt: string;
  /** Development and test only: the SMS adapter arrives in increment 3.6. */
  devCode?: string;
}

const invalidCode = () => new AppError('UNAUTHENTICATED', 'Invalid or expired code');

/**
 * Phone OTP (REQ-13): 6 digits, short TTL, capped attempts, hashed at rest with
 * the same argon2id settings as passwords. Only the newest code for a phone and
 * purpose is live, so requesting again invalidates the previous one.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger('Otp');

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async issue(phone: string, purpose = OTP_PURPOSE_LOGIN): Promise<OtpChallenge> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const ttlMinutes = this.config.get('OTP_TTL_MINUTES', { infer: true });
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
    const codeHash = await this.passwords.hashSecret(code);

    await this.prisma.$transaction(async (tx) => {
      await tx.otpCode.updateMany({
        where: { phone, purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await tx.otpCode.create({ data: { phone, purpose, codeHash, expiresAt } });
    });

    // Until notifications land, this is the only delivery channel.
    this.logger.log(`OTP for ${phone}: ${code} (expires ${expiresAt.toISOString()})`);
    return { expiresAt: expiresAt.toISOString(), ...(this.exposeCode() ? { devCode: code } : {}) };
  }

  /** Consumes the code on success. Throws on a wrong, expired or exhausted code. */
  async consume(phone: string, code: string, purpose = OTP_PURPOSE_LOGIN): Promise<void> {
    const row = await this.prisma.otpCode.findFirst({
      where: { phone, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) throw invalidCode();

    const maxAttempts = this.config.get('OTP_MAX_ATTEMPTS', { infer: true });
    if (row.attempts >= maxAttempts) {
      await this.prisma.otpCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
      throw new AppError('RATE_LIMITED', 'Too many attempts. Request a new code.');
    }

    if (!(await this.passwords.verify(row.codeHash, code))) {
      await this.prisma.otpCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
      throw invalidCode();
    }

    await this.prisma.otpCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
  }

  private exposeCode(): boolean {
    const env = this.config.get('NODE_ENV', { infer: true });
    return env === 'development' || env === 'test';
  }
}
