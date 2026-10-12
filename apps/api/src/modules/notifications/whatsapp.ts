import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '@fakhri/config';
import { WhatsAppTemplateSend } from './templates';

/** Graph API call for one approved template. `to` is the canonical +92 number. */
export interface WhatsAppTemplateMessage extends WhatsAppTemplateSend {
  to: string;
}

/**
 * WhatsApp Cloud API sender. Callers keep using NotificationsService; this is
 * only invoked when NOTIFICATIONS_CHANNEL is whatsapp.
 */
@Injectable()
export class WhatsAppCloudClient {
  private readonly logger = new Logger('WhatsAppCloud');

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async send(message: WhatsAppTemplateMessage, fetchImpl: typeof fetch = fetch): Promise<void> {
    const token = this.config.get('WHATSAPP_ACCESS_TOKEN', { infer: true });
    const phoneNumberId = this.config.get('WHATSAPP_PHONE_NUMBER_ID', { infer: true });
    if (!token || !phoneNumberId) throw new Error('WhatsApp Cloud API is not configured');

    const version = this.config.get('WHATSAPP_GRAPH_VERSION', { infer: true });
    const parameters = message.bodyParameters.map((text) => ({ type: 'text', text: text || '-' }));
    const response = await fetchImpl(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: message.to.replace(/^\+/, ''),
        type: 'template',
        template: {
          name: message.templateName,
          language: { code: message.language },
          ...(parameters.length > 0 ? { components: [{ type: 'body', parameters }] } : {}),
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      this.logger.warn(`WhatsApp Cloud API answered ${response.status}`);
      throw new Error(`WhatsApp Cloud API answered ${response.status}`);
    }
  }
}

export function whatsappSignature(secret: string, rawBody: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

export function signaturesMatch(expected: string, received: string | undefined): boolean {
  if (!received) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Phone numbers in an inbound payload whose text asks to STOP. */
export function stopSenders(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const entry = (payload as { entry?: unknown }).entry;
  if (!Array.isArray(entry)) return [];
  const phones: string[] = [];
  for (const item of entry) {
    const changes = (item as { changes?: unknown }).changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const messages = (change as { value?: { messages?: unknown } }).value?.messages;
      if (!Array.isArray(messages)) continue;
      for (const message of messages) {
        const from = (message as { from?: unknown }).from;
        const text = messageText(message);
        if (typeof from === 'string' && text && /\bstop\b/i.test(text)) phones.push(from);
      }
    }
  }
  return phones;
}

function messageText(message: unknown): string | undefined {
  if (!message || typeof message !== 'object') return undefined;
  const record = message as { type?: unknown; text?: { body?: unknown }; button?: { text?: unknown } };
  if (record.type === 'text' && typeof record.text?.body === 'string') return record.text.body;
  if (record.type === 'button' && typeof record.button?.text === 'string') return record.button.text;
  return undefined;
}
