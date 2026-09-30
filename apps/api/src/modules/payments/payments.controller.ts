import { Body, Controller, Headers, HttpCode, HttpStatus, Param, Patch, Post, Req } from '@nestjs/common';
import { UserRole } from '@fakhri/prisma';
import { OptionalAuth, Public, RateLimit, Roles } from '../auth/auth.decorators';
import { AuthenticatedRequest } from '../auth/principal';
import { GatewayCallbackDto, InitiatePaymentDto, SetPaymentStatusDto } from './payments.dto';
import { PaymentsService } from './payments.service';

interface RawBodyRequest extends AuthenticatedRequest {
  rawBody?: Buffer;
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Start a hosted-checkout session for an online payment (REQ-21). */
  @OptionalAuth()
  // Bucketed per payment: retrying one checkout should not throttle everyone
  // else behind the same carrier NAT address.
  @RateLimit({ limit: 20, windowSeconds: 60, paramKey: 'paymentId' })
  @Post(':paymentId/initiate')
  @HttpCode(HttpStatus.OK)
  async initiate(
    @Param('paymentId') paymentId: string,
    @Body() dto: InitiatePaymentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return { data: await this.payments.initiate(paymentId, dto, request.principal) };
  }

  /**
   * Provider callback. Public by necessity — the provider has no token — and
   * therefore authenticated by signature over the raw body instead.
   */
  @Public()
  @RateLimit({ limit: 120, windowSeconds: 60 })
  @Post('webhook/:gateway')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Param('gateway') gateway: string,
    @Body() dto: GatewayCallbackDto,
    @Req() request: RawBodyRequest,
    @Headers('x-signature') signature?: string,
  ) {
    const raw = request.rawBody?.toString('utf8') ?? JSON.stringify(dto);
    return { data: await this.payments.handleCallback(gateway, dto, raw, signature) };
  }
}

@Controller('admin/orders')
@Roles(UserRole.ORDERS)
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Patch(':id/payment-status')
  async setStatus(@Param('id') id: string, @Body() dto: SetPaymentStatusDto) {
    return { data: await this.payments.setStatusByAdmin(id, dto) };
  }
}
