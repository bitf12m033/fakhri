import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { AppError, ErrorCode, ErrorPayload } from '@fakhri/shared';
import type { Request, Response } from 'express';
import { traceIdOf } from '../logger-context';

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  [HttpStatus.BAD_REQUEST]: 'INVALID_INPUT',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'CONFLICT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

const CODE_TO_STATUS: Partial<Record<ErrorCode, number>> = {
  INVALID_INPUT: HttpStatus.BAD_REQUEST,
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  OUT_OF_STOCK: HttpStatus.CONFLICT,
  PRICE_CHANGED: HttpStatus.CONFLICT,
  COUPON_INVALID: HttpStatus.BAD_REQUEST,
  COUPON_LIMIT: HttpStatus.BAD_REQUEST,
  STOCK_RESERVATION_FAILED: HttpStatus.CONFLICT,
  PAYMENT_PENDING: HttpStatus.CONFLICT,
  CART_EMPTY: HttpStatus.BAD_REQUEST,
  ORDER_STATUS_INVALID: HttpStatus.CONFLICT,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  INTERNAL: HttpStatus.INTERNAL_SERVER_ERROR,
};

interface ErrorBody {
  code?: ErrorCode;
  message?: unknown;
  details?: unknown;
}

/**
 * Global exception filter. Returns the structured error contract
 * `{ error: { code, message, details, traceId } }` (04-architecture-api.md §6).
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const traceId = traceIdOf(req);

    let status: number;
    let code: ErrorCode = 'INTERNAL';
    let message: string;
    let details: unknown;

    if (exception instanceof AppError) {
      status = CODE_TO_STATUS[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse() as string | ErrorBody;
      if (typeof body === 'string') {
        message = body;
      } else {
        code = body.code ?? STATUS_TO_CODE[status] ?? 'INTERNAL';
        details = body.details;
        message = Array.isArray(body.message)
          ? body.message.join('; ')
          : (typeof body.message === 'string' ? body.message : String(body.message));
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      code = 'INTERNAL';
      message = exception instanceof Error ? exception.message : 'Internal server error';
    }

    const payload: ErrorPayload = { code: code ?? 'INTERNAL', message, details, traceId };

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.url} -> ${status} ${payload.code}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`${req.method} ${req.url} -> ${status} ${payload.code}`);
    }

    res.status(status).json({ error: payload });
  }
}