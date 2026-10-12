import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { LeadConsent, UserRole } from '@fakhri/prisma';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { whatsappSignature } from '../src/modules/notifications/whatsapp';
import { createAdmin, deleteAdmins, TestAdmin } from './support/admin';
import { allocatePhone, deleteCustomers } from './support/customer';

const VERIFY_TOKEN = 'verify-token-test';
const APP_SECRET = 'app-secret-test-value';

let app: INestApplication;

function local(phone: string): string {
  return `0${phone.slice(3)}`;
}

describe('WhatsApp STOP webhook (e2e)', () => {
  let marketing: TestAdmin;
  const adminIds: string[] = [];
  const phone = allocatePhone();
  const unknownPhone = allocatePhone();
  const importIds: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV ??= 'test';
    process.env.DATABASE_URL ??= 'postgresql://fakhri:fakhri_dev@localhost:5432/fakhri';
    process.env.REDIS_URL ??= 'redis://localhost:6379';
    process.env.WHATSAPP_VERIFY_TOKEN = VERIFY_TOKEN;
    process.env.WHATSAPP_APP_SECRET = APP_SECRET;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await configureApp(app);
    await app.init();
    marketing = await createAdmin(app, UserRole.MARKETING, 'marketing');
    adminIds.push(marketing.id);
  }, 60_000);

  afterAll(async () => {
    if (!app) return;
    const prisma = app.get(PrismaService);
    await prisma.leadCase.deleteMany({ where: { lead: { phone } } });
    await prisma.lead.deleteMany({ where: { phone } });
    if (importIds.length > 0) await prisma.leadImport.deleteMany({ where: { id: { in: importIds } } });
    await deleteCustomers(prisma, [phone]);
    await deleteAdmins(prisma, adminIds);
    await app.close();
  });

  function signed(body: string) {
    return request(app.getHttpServer())
      .post('/api/v1/webhooks/whatsapp')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', whatsappSignature(APP_SECRET, body))
      .send(body);
  }

  it('verifies the subscription and records STOP for a known lead', async () => {
    const challenge = await request(app.getHttpServer())
      .get('/api/v1/webhooks/whatsapp')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': 'challenge-42' });
    expect(challenge.status).toBe(200);
    expect(challenge.text).toBe('challenge-42');

    const rejected = await request(app.getHttpServer())
      .get('/api/v1/webhooks/whatsapp')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong-token', 'hub.challenge': 'challenge-42' });
    expect(rejected.status).toBe(403);

    const imported = await request(app.getHttpServer())
      .post('/api/v1/admin/leads/imports')
      .set('authorization', `Bearer ${marketing.token}`)
      .send({ csv: `Phone,First Name\n${local(phone)},Sana\n`, fileName: 'stop.csv' });
    expect(imported.status, JSON.stringify(imported.body)).toBe(201);
    importIds.push(imported.body.data.importId);

    const hello = JSON.stringify({
      entry: [{ changes: [{ value: { messages: [{ from: phone.slice(1), type: 'text', text: { body: 'hello' } }] } }] }],
    });
    const greeting = await signed(hello);
    expect(greeting.status).toBe(200);
    expect(greeting.body.data.optedOut).toBe(0);

    const stop = JSON.stringify({
      entry: [{ changes: [{ value: { messages: [{ from: phone.slice(1), type: 'text', text: { body: 'Please STOP' } }] } }] }],
    });
    const forged = await request(app.getHttpServer())
      .post('/api/v1/webhooks/whatsapp')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', 'sha256=deadbeef')
      .send(stop);
    expect(forged.status).toBe(401);

    const recorded = await signed(stop);
    expect(recorded.status, JSON.stringify(recorded.body)).toBe(200);
    expect(recorded.body.data.optedOut).toBe(1);

    const lead = await app.get(PrismaService).lead.findUniqueOrThrow({ where: { phone } });
    expect(lead.consent).toBe(LeadConsent.OPTED_OUT);

    const unknown = JSON.stringify({
      entry: [{ changes: [{ value: { messages: [{ from: unknownPhone.slice(1), type: 'text', text: { body: 'STOP' } }] } }] }],
    });
    const ignored = await signed(unknown);
    expect(ignored.status).toBe(200);
    expect(ignored.body.data.optedOut).toBe(0);
    expect(await app.get(PrismaService).lead.findUnique({ where: { phone: unknownPhone } })).toBeNull();
  });
});
