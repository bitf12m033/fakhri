import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '@fakhri/config';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { WhatsAppCloudClient, signaturesMatch, stopSenders, whatsappSignature } from '../src/modules/notifications/whatsapp';

function config(values: Record<string, string | undefined>): ConfigService<AppConfig, true> {
  return { get: (key: string) => values[key] } as ConfigService<AppConfig, true>;
}

describe('WhatsApp Cloud API', () => {
  it('signs the raw body and accepts only that signature', () => {
    const secret = 'app-secret-test-value';
    const body = '{"entry":[]}';
    const signature = whatsappSignature(secret, body);
    expect(signature.startsWith('sha256=')).toBe(true);
    expect(signaturesMatch(signature, signature)).toBe(true);
    expect(signaturesMatch(signature, whatsappSignature('other-secret-value', body))).toBe(false);
    expect(signaturesMatch(signature, undefined)).toBe(false);
  });

  it('reads STOP from a text or button reply and ignores delivery status', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [{ status: 'delivered' }],
                messages: [
                  { from: '923001112233', type: 'text', text: { body: 'Please STOP' } },
                  { from: '923001112244', type: 'text', text: { body: 'the stopper is fine' } },
                  { from: '923001112255', type: 'button', button: { text: 'Stop' } },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(stopSenders(payload)).toEqual(['923001112233', '923001112255']);
    expect(stopSenders({ entry: [] })).toEqual([]);
  });

  it('posts an approved template and does not put the response body in an error', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const client = new WhatsAppCloudClient(
      config({
        WHATSAPP_ACCESS_TOKEN: 'token',
        WHATSAPP_PHONE_NUMBER_ID: '123',
        WHATSAPP_GRAPH_VERSION: 'v21.0',
      }),
    );
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body) });
      return new Response(JSON.stringify({ error: { message: '+923001112233 leaked' } }), { status: 400 });
    }) as typeof fetch;

    await expect(
      client.send(
        { to: '+923001112233', templateName: 'ac_offer', language: 'en', bodyParameters: ['Sana', ''] },
        fetchImpl,
      ),
    ).rejects.toThrow('WhatsApp Cloud API answered 400');
    expect(calls[0]?.url).toBe('https://graph.facebook.com/v21.0/123/messages');
    const posted = JSON.parse(calls[0]?.body ?? '{}') as { to: string; template: { components: Array<{ parameters: Array<{ text: string }> }> } };
    expect(posted.to).toBe('923001112233');
    expect(posted.template.components[0]?.parameters.map((item) => item.text)).toEqual(['Sana', '-']);
  });

  it('does not call the Cloud API from the console adapter', async () => {
    let called = false;
    const whatsapp = { send: async () => { called = true; } };
    const service = new NotificationsService(config({ NOTIFICATIONS_CHANNEL: 'console' }), whatsapp as never);
    const sent = await service.deliver([
      { channel: 'WHATSAPP', to: '+923001112233', subject: 'AC offer', body: 'Hello', event: 'CAMPAIGN_MESSAGE' },
    ]);
    expect(sent).toBe(1);
    expect(called).toBe(false);
  });

  it('counts a Cloud API rejection as not delivered', async () => {
    const service = new NotificationsService(
      config({ NOTIFICATIONS_CHANNEL: 'whatsapp' }),
      { send: async () => { throw new Error('WhatsApp Cloud API answered 400'); } } as never,
    );
    const sent = await service.deliver([
      {
        channel: 'WHATSAPP',
        to: '+923001112233',
        subject: 'AC offer',
        body: 'Hello',
        event: 'CAMPAIGN_MESSAGE',
        whatsapp: { templateName: 'ac_offer', language: 'en', bodyParameters: ['Sana'] },
      },
    ]);
    expect(sent).toBe(0);
  });
});
