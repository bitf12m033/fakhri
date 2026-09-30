import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Public, RateLimit, CustomerRoute } from '../auth/auth.decorators';
import { RefreshTokenDto } from '../auth/auth.dto';
import { ReqContext, RequestContext } from '../auth/principal';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerLoginDto, CustomerRegisterDto, OtpRequestDto, OtpVerifyDto } from './customer.dto';

@Controller('auth/customer')
export class CustomerAuthController {
  constructor(private readonly auth: CustomerAuthService) {}

  @Public()
  // Deliberately loose: carrier NAT puts many legitimate customers behind one
  // address. Abuse is caught per phone number by the OTP limit instead.
  @RateLimit({ limit: 20, windowSeconds: 60 })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: CustomerRegisterDto, @ReqContext() context: RequestContext) {
    return { data: await this.auth.register(dto, context) };
  }

  @Public()
  @RateLimit({ limit: 10, windowSeconds: 60, bodyKey: 'phone', configKey: 'RATE_LIMIT_AUTH_PER_MINUTE' })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: CustomerLoginDto, @ReqContext() context: RequestContext) {
    return { data: await this.auth.login(dto, context) };
  }

  @Public()
  @RateLimit({ limit: 5, windowSeconds: 3600, bodyKey: 'phone', configKey: 'OTP_REQUESTS_PER_HOUR' })
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  async requestOtp(@Body() dto: OtpRequestDto) {
    return { data: await this.auth.requestOtp(dto) };
  }

  @Public()
  @RateLimit({ limit: 10, windowSeconds: 60, bodyKey: 'phone' })
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() dto: OtpVerifyDto, @ReqContext() context: RequestContext) {
    return { data: await this.auth.verifyOtp(dto, context) };
  }

  @Public()
  // Bucketed by the presented token, not the shared NAT address.
  @RateLimit({ limit: 30, windowSeconds: 60, bodyKey: 'refreshToken' })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto, @ReqContext() context: RequestContext) {
    return { data: await this.auth.refresh(dto.refreshToken, context) };
  }

  @CustomerRoute()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() dto: RefreshTokenDto) {
    return { data: await this.auth.logout(dto.refreshToken) };
  }
}
