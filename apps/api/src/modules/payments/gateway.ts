import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '@fakhri/config';
import { invalidInput } from '@fakhri/shared';

export interface SessionRequest {
  paymentId: string;
  orderRef: string;
  /** Major units, exactly two decimals. */
  amount: string;
  customerPhone: string;
  customerEmail?: string;
}

export interface SessionResponse {
  gateway: string;
  gatewayRef: string;
  /** Where to send the buyer to pay. */
  redirectUrl: string;
  expiresAt: string;
}

export type CallbackOutcome = 'SUCCEEDED' | 'FAILED';

export interface ParsedCallback {
  gatewayRef: string;
  outcome: CallbackOutcome;
  amount: string;
  raw: Record<string, unknown>;
}

/**
 * Gateway adapter boundary (REQ-21). A real provider implements this and nothing
 * else in the codebase changes: the service only knows createSession, a signature
 * check and a parsed callback.
 */
export interface PaymentGateway {
  readonly name: string;
  createSession(request: SessionRequest): Promise<SessionResponse>;
  /** Constant-time verification of the provider's signature header. */
  verifySignature(rawBody: string, signature: string | undefined): boolean;
  parseCallback(body: unknown): ParsedCallback;
}

export const MOCK_GATEWAY = 'mock';
const SESSION_TTL_MINUTES = 30;

/**
 * Stand-in provider for development and tests (REQ-21: "mock impl now").
 * It behaves like a hosted-checkout gateway: we hand back a redirect URL, and it
 * calls our webhook with an HMAC-signed body. Signing with a shared secret is
 * exactly what JazzCash and Easypaisa do, so the real adapter is a swap.
 */
@Injectable()
export class MockPaymentGateway implements PaymentGateway {
  readonly name = MOCK_GATEWAY;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async createSession(request: SessionRequest): Promise<SessionResponse> {
    const gatewayRef = `MOCK-${randomBytes(8).toString('hex').toUpperCase()}`;
    const returnUrl = this.config.get('PAYMENT_RETURN_URL', { infer: true });
    const query = new URLSearchParams({
      ref: gatewayRef,
      order: request.orderRef,
      amount: request.amount,
    });
    return {
      gateway: this.name,
      gatewayRef,
      redirectUrl: `${returnUrl}?${query.toString()}`,
      expiresAt: new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000).toISOString(),
    };
  }

  verifySignature(rawBody: string, signature: string | undefined): boolean {
    if (!signature) return false;
    const expected = this.sign(rawBody);
    const given = Buffer.from(signature, 'utf8');
    const want = Buffer.from(expected, 'utf8');
    return given.length === want.length && timingSafeEqual(given, want);
  }

  /** Exposed so tests and local tooling can produce a valid callback. */
  sign(rawBody: string): string {
    return createHmac('sha256', this.config.get('PAYMENT_MOCK_SECRET', { infer: true }))
      .update(rawBody)
      .digest('hex');
  }

  parseCallback(body: unknown): ParsedCallback {
    const payload = (body ?? {}) as Record<string, unknown>;
    const gatewayRef = typeof payload.ref === 'string' ? payload.ref : '';
    const status = typeof payload.status === 'string' ? payload.status.toUpperCase() : '';
    const amount = typeof payload.amount === 'string' ? payload.amount : '';

    if (!gatewayRef || !amount) throw invalidInput('Callback is missing ref or amount');
    if (status !== 'SUCCEEDED' && status !== 'FAILED') {
      throw invalidInput('Callback status must be SUCCEEDED or FAILED', { status });
    }
    return { gatewayRef, outcome: status, amount, raw: payload };
  }
}
