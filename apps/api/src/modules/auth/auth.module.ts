import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AppConfig } from '@fakhri/config';
import { AccessGuard } from './access.guard';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { LockoutService } from './lockout.service';
import { PasswordService } from './password.service';
import { RateLimitGuard } from './rate-limit.guard';
import { TokenService } from './token.service';

/**
 * Authentication, RBAC and admin accounts (increment 3.4).
 *
 * Global and in this order: the rate limiter runs before any credential work,
 * then the access guard, which denies anything that does not declare a policy.
 * Global so that a route added in a later increment is covered by default.
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
      }),
    }),
  ],
  controllers: [AdminAuthController, AdminUsersController],
  providers: [
    PasswordService,
    TokenService,
    LockoutService,
    AdminAuthService,
    AdminUsersService,
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
  exports: [PasswordService, TokenService, LockoutService],
})
export class AuthModule {}
