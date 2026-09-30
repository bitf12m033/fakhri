/**
 * Structured error contract shared between API and web
 * (see docs/aidlc/04-architecture-api.md §6 for the code list).
 */
export type ErrorCode =
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'OUT_OF_STOCK'
  | 'PRICE_CHANGED'
  | 'COUPON_INVALID'
  | 'COUPON_LIMIT'
  | 'STOCK_RESERVATION_FAILED'
  | 'PAYMENT_PENDING'
  | 'CART_EMPTY'
  | 'ORDER_STATUS_INVALID'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface ErrorPayload {
  code: ErrorCode;
  message: string;
  details?: unknown;
  traceId?: string;
}

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
    options: { cause?: unknown } = {},
  ) {
    super(message, options);
    this.name = 'AppError';
  }

  toPayload(traceId?: string): ErrorPayload {
    return { code: this.code, message: this.message, details: this.details, traceId };
  }
}

export const outOfStock = (sku?: string): AppError =>
  new AppError('OUT_OF_STOCK', sku ? `Item is out of stock: ${sku}` : 'Item is out of stock');

export const notFound = (entity: string): AppError => new AppError('NOT_FOUND', `${entity} not found`);

export const conflict = (message: string, details?: unknown): AppError =>
  new AppError('CONFLICT', message, details);