import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '@fakhri/config';
import { AppError } from '@fakhri/shared';
import type { Response } from 'express';
import { Public, RateLimit } from '../auth/auth.decorators';
import { LeadsService } from '../leads/leads.service';
import { signaturesMatch, stopSenders, whatsappSignature } from './whatsapp';

interface RawBodyRequest {
  rawBody?: Buffer;
}

/**
 * Meta's webhook. Public because Meta has no admin token; the verify token and
 * the app-secret signature are the credentials. A STOP text opts that lead out.
 */
@Controller('webhooks/whatsapp')
@Public()
@RateLimit({ limit: 120, windowSeconds: 60 })
export class WhatsAppWebhookController {
  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly leads: LeadsService,
  ) {}

  @Get()
  verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() response: Response,
  ): void {
    const expected = this.config.get('WHATSAPP_VERIFY_TOKEN', { infer: true });
    if (!expected) {
      response.status(HttpStatus.NOT_FOUND).send();
      return;
    }
    if (mode === 'subscribe' && typeof token === 'string' && signaturesMatch(expected, token) && challenge) {
      response.status(HttpStatus.OK).type('text/plain').send(challenge);
      return;
    }
    response.status(HttpStatus.FORBIDDEN).send();
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Body() payload: unknown,
    @Req() request: RawBodyRequest,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    const secret = this.config.get('WHATSAPP_APP_SECRET', { infer: true });
    const raw = request.rawBody?.toString('utf8');
    if (!secret || !raw || !signaturesMatch(whatsappSignature(secret, raw), signature)) {
      throw new AppError('UNAUTHENTICATED', 'Webhook signature did not verify');
    }

    let optedOut = 0;
    for (const phone of stopSenders(payload)) {
      try {
        await this.leads.optOut({ phone });
        optedOut += 1;
      } catch (error) {
        if (error instanceof AppError && (error.code === 'NOT_FOUND' || error.code === 'INVALID_INPUT')) continue;
        throw error;
      }
    }
    return { data: { optedOut } };
  }
}
