import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { UserRole } from '@fakhri/prisma';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { createAdmin, deleteAdmins, TestAdmin } from './support/admin';
import { allocatePhone, deleteCustomers } from './support/customer';

let app: INestApplication;

function local(phone: string): string {
  return `0${phone.slice(3)}`;
}

describe('WhatsApp campaigns (e2e)', () => {
  let marketing: TestAdmin;
  let catalog: TestAdmin;
  const adminIds: string[] = [];
  const phones = [allocatePhone(), allocatePhone(), allocatePhone(), allocatePhone()];
  const [optedIn, optedOut, unknown, otherOptedIn] = phones;
  const city = `City${phones[0].slice(-6)}`;
  const product = `Sku${phones[0].slice(-6)}`;
  const importIds: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV ??= 'test';
    process.env.DATABASE_URL ??= 'postgresql://fakhri:fakhri_dev@localhost:5432/fakhri';
    process.env.REDIS_URL ??= 'redis://localhost:6379';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await configureApp(app);
    await app.init();
    marketing = await createAdmin(app, UserRole.MARKETING, 'marketing');
    catalog = await createAdmin(app, UserRole.CATALOG, 'catalog');
    adminIds.push(marketing.id, catalog.id);
  }, 60_000);

  afterAll(async () => {
    if (!app) return;
    const prisma = app.get(PrismaService);
    await prisma.campaignRecipient.deleteMany({ where: { lead: { phone: { in: phones } } } });
    if (marketing) {
      await prisma.campaign.deleteMany({ where: { createdById: marketing.id } });
      await prisma.campaignTemplate.deleteMany({ where: { createdById: marketing.id } });
    }
    await prisma.leadCase.deleteMany({ where: { lead: { phone: { in: phones } } } });
    await prisma.lead.deleteMany({ where: { phone: { in: phones } } });
    if (importIds.length > 0) await prisma.leadImport.deleteMany({ where: { id: { in: importIds } } });
    await deleteCustomers(prisma, phones);
    await deleteAdmins(prisma, adminIds);
    await app.close();
  });

  async function leadId(phone: string): Promise<string> {
    const lead = await app.get(PrismaService).lead.findUniqueOrThrow({ where: { phone } });
    return lead.id;
  }

  it('sends an approved template only to opted-in leads in the audience', async () => {
    const csv = [
      'Phone,First Name,Product,City',
      `${local(optedIn)},Sana,${product},${city}`,
      `${local(optedOut)},Ali,${product},${city}`,
      `${local(unknown)},Noor,Refrigerator,Karachi`,
      `${local(otherOptedIn)},Hina,Refrigerator,${city}`,
    ].join('\n');

    const imported = await request(app.getHttpServer())
      .post('/api/v1/admin/leads/imports')
      .set('authorization', `Bearer ${marketing.token}`)
      .send({ csv, fileName: 'audience.csv' });
    expect(imported.status, JSON.stringify(imported.body)).toBe(201);
    importIds.push(imported.body.data.importId);

    const optedInId = await leadId(optedIn);
    const otherId = await leadId(otherOptedIn);
    const inConsent = await request(app.getHttpServer())
      .patch(`/api/v1/admin/leads/${optedInId}/consent`)
      .set('authorization', `Bearer ${marketing.token}`)
      .send({ consent: 'OPTED_IN' });
    expect(inConsent.status).toBe(200);
    expect(inConsent.body.data.consent).toBe('OPTED_IN');
    expect(inConsent.body.data.consentAt).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/leads/${otherId}/consent`)
      .set('authorization', `Bearer ${marketing.token}`)
      .send({ consent: 'OPTED_IN' })
      .expect(200);

    const stopped = await request(app.getHttpServer())
      .post('/api/v1/admin/leads/opt-out')
      .set('authorization', `Bearer ${marketing.token}`)
      .send({ phone: local(optedOut) });
    expect(stopped.status).toBe(200);
    expect(stopped.body.data.consent).toBe('OPTED_OUT');

    const missingStop = await request(app.getHttpServer())
      .post('/api/v1/admin/campaign-templates')
      .set('authorization', `Bearer ${marketing.token}`)
      .send({ name: 'No opt out', body: 'Hello {{firstName}}' });
    expect(missingStop.status).toBe(400);

    const draft = await request(app.getHttpServer())
      .post('/api/v1/admin/campaign-templates')
      .set('authorization', `Bearer ${marketing.token}`)
      .send({
        name: 'AC offer',
        body: 'Hello {{firstName}}, the {{productInterest}} is ready. Reply STOP to opt out.',
      });
    expect(draft.status).toBe(201);
    expect(draft.body.data.status).toBe('DRAFT');
    const templateId = draft.body.data.id as string;

    const tooSoon = await request(app.getHttpServer())
      .post('/api/v1/admin/campaigns')
      .set('authorization', `Bearer ${marketing.token}`)
      .send({ name: 'March', templateId, city, productInterest: product });
    expect(tooSoon.status).toBe(400);

    const preview = await request(app.getHttpServer())
      .post('/api/v1/admin/campaigns/preview')
      .set('authorization', `Bearer ${marketing.token}`)
      .send({ templateId, city, productInterest: product });
    expect(preview.status).toBe(200);
    expect(preview.body.data).toMatchObject({
      eligible: 1,
      excluded: { unknown: 0, optedOut: 1 },
      templateStatus: 'DRAFT',
    });
    expect(await app.get(PrismaService).campaign.count({ where: { createdById: marketing.id } })).toBe(0);

    const approved = await request(app.getHttpServer())
      .post(`/api/v1/admin/campaign-templates/${templateId}/approve`)
      .set('authorization', `Bearer ${marketing.token}`);
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe('APPROVED');

    const forbidden = await request(app.getHttpServer())
      .post('/api/v1/admin/campaigns')
      .set('authorization', `Bearer ${catalog.token}`)
      .send({ name: 'March', templateId, city, productInterest: product });
    expect(forbidden.status).toBe(403);

    const sent = await request(app.getHttpServer())
      .post('/api/v1/admin/campaigns')
      .set('authorization', `Bearer ${marketing.token}`)
      .send({ name: 'March', templateId, city, productInterest: product });
    expect(sent.status, JSON.stringify(sent.body)).toBe(201);
    expect(sent.body.data).toMatchObject({ status: 'SENT', recipientCount: 1, sentCount: 1 });

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/campaigns/${sent.body.data.id}`)
      .set('authorization', `Bearer ${marketing.token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.recipients).toEqual([
      expect.objectContaining({ leadId: optedInId, phone: optedIn, status: 'SENT', firstName: 'Sana' }),
    ]);

    const notifications = app.get(NotificationsService);
    const delivered = notifications.sent({ event: 'CAMPAIGN_MESSAGE', to: optedIn });
    expect(delivered).toHaveLength(1);
    expect(delivered[0].channel).toBe('WHATSAPP');
    expect(delivered[0].body).toBe(`Hello Sana, the ${product} is ready. Reply STOP to opt out.`);
    expect(notifications.sent({ event: 'CAMPAIGN_MESSAGE', to: optedOut })).toHaveLength(0);
    expect(notifications.sent({ event: 'CAMPAIGN_MESSAGE', to: otherOptedIn })).toHaveLength(0);
    expect(notifications.sent({ event: 'CAMPAIGN_MESSAGE', to: unknown })).toHaveLength(0);

    const audit = await app.get(PrismaService).auditLog.findFirst({
      where: { entityId: sent.body.data.id, action: 'campaigns.send' },
    });
    expect(audit?.actorId).toBe(marketing.id);
    expect(JSON.stringify(audit?.after)).not.toContain(optedIn);

    const again = await request(app.getHttpServer())
      .post('/api/v1/admin/leads/imports')
      .set('authorization', `Bearer ${marketing.token}`)
      .send({ csv, fileName: 'audience.csv' });
    expect(again.status).toBe(201);
    importIds.push(again.body.data.importId);
    const still = await app.get(PrismaService).lead.findUniqueOrThrow({ where: { phone: optedIn } });
    expect(still.consent).toBe('OPTED_IN');
  });
});
