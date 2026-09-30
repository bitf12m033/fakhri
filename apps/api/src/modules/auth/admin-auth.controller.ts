import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { Public, RateLimit, Roles } from './auth.decorators';
import { AdminLoginDto, RefreshTokenDto } from './auth.dto';
import { ReqContext, RequestContext } from './principal';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Public()
  @RateLimit({ limit: 10, windowSeconds: 60, bodyKey: 'email', configKey: 'RATE_LIMIT_AUTH_PER_MINUTE' })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: AdminLoginDto, @ReqContext() context: RequestContext) {
    return { data: await this.auth.login(dto, context) };
  }

  @Public()
  @RateLimit({ limit: 30, windowSeconds: 60 })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto, @ReqContext() context: RequestContext) {
    return { data: await this.auth.refresh(dto, context) };
  }

  /** Revokes the presented refresh token. Any authenticated admin may call it. */
  @Roles()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() dto: RefreshTokenDto) {
    return { data: await this.auth.logout(dto) };
  }
}
