import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { invalidInput } from '@fakhri/shared';
import { OptionalAuth, RateLimit } from '../auth/auth.decorators';
import { ReqContext, RequestContext } from '../auth/principal';
import { CartContext } from '../cart/cart-identity';
import { CartOwner } from '../cart/cart.service';
import { CheckoutDto, CheckoutQuoteDto } from './checkout.dto';
import { CheckoutService } from './checkout.service';

const KEY_HEADER = 'Idempotency-Key';

/** Order placement for guests and customers alike (REQ-19). */
@Controller('checkout')
@OptionalAuth()
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 20, windowSeconds: 60 })
  async place(
    @CartContext() owner: CartOwner,
    @Body() dto: CheckoutDto,
    @ReqContext() request: RequestContext,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const key = idempotencyKey?.trim();
    // Required rather than optional: a retried checkout must never place a second order.
    if (!key || key.length < 8 || key.length > 200) {
      throw invalidInput(`Send a unique ${KEY_HEADER} header of 8 to 200 characters`);
    }
    return { data: await this.checkout.checkout({ ...owner, ...request }, dto, key) };
  }

  /** Price the cart for a delivery choice without placing anything (increment 3.8). */
  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 60, windowSeconds: 60 })
  async quote(@CartContext() owner: CartOwner, @Body() dto: CheckoutQuoteDto) {
    return { data: await this.checkout.quote(owner, dto) };
  }
}
