import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/principal';
import { CART_TOKEN_HEADER, CartOwner } from './cart.service';

/**
 * Who this cart belongs to: the signed-in customer, or the guest token the
 * client echoes back in `X-Cart-Token`. Both may be present, in which case the
 * guest cart is merged into the customer's.
 */
export const CartContext = createParamDecorator((_data: unknown, ctx: ExecutionContext): CartOwner => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  const header = request.headers[CART_TOKEN_HEADER];
  const token = Array.isArray(header) ? header[0] : header;
  return {
    customerId: request.principal?.type === 'CUSTOMER' ? request.principal.id : undefined,
    token: token?.trim() || undefined,
  };
});
