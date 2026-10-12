import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { UserRole } from '@fakhri/prisma';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { createAdmin, deleteAdmins, TestAdmin } from './support/admin';
import { allocatePhone, deleteCustomers, registerCustomer } from './support/customer';

let app: INestApplication;

function local(phone: string): string {
  return `0${phone.slice(3)}`;
}

describe('Lead import (e2e)', () => {
  let marketing: TestAdmin;
  let catalog: TestAdmin;
  const adminIds: string[] = [];
  const phones: string[] = [];
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
    await prisma.leadCase.deleteMany({ where: { lead: { phone: { in: phones } } } });
    await prisma.lead.deleteMany({ where: { phone: { in: phones } } });
    if (importIds.length > 0) await prisma.leadImport.deleteMany({ where: { id: { in: importIds } } });
    await deleteCustomers(prisma, phones);
    await deleteAdmins(prisma, adminIds);
    await app.close();
  });

  it('previews without writing, then commits only a clean file', async () => {
    const customer = await registerCustomer(app);
    phones.push(customer.phone);
    const fresh = allocatePhone();
    phones.push(fresh);

    const dirty = [
      'Case Number,Phone,Product,City,First Name',
      `C-ok,${local(fresh)},AC,Lahore,Sana`,
      'C-bad,12345,TV,Lahore,Nope',
    ].join('\n');

    const anonymous = await request(app.getHttpServer()).post('/api/v1/admin/leads/imports/preview').send({ csv: dirty });
    expect(anonymous.status).toBe(401);

    const wrongRole = await request(app.getHttpServer())
      .post('/api/v1/admin/leads/imports/preview')
      .set('authorization', `Bearer ${catalog.token}`)
      .send({ csv: dirty });
    expect(wrongRole.status).toBe(403);

    const preview = await request(app.getHttpServer())
      .post('/api/v1/admin/leads/imports/preview')
      .set('authorization', `Bearer ${marketing.token}`)
      .send({ csv: dirty, fileName: 'cases.csv' });
    expect(preview.status).toBe(200);
    expect(preview.body.data.invalidRows).toBe(1);
    expect(preview.body.data.newLeads).toBe(1);
    expect(await app.get(PrismaService).lead.count({ where: { phone: fresh } })).toBe(0);

    const refused = await request(app.getHttpServer())
      .post('/api/v1/admin/leads/imports')
      .set('authorization', `Bearer ${marketing.token}`)
      .send({ csv: dirty });
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe('INVALID_INPUT');

    const clean = [
      'Case Number,Account Name,Phone,Case Status,Product,City,First Name,Caller Phone',
      `C-1,Acme,${local(fresh)},Closed,AC,Lahore,Sana,${local(customer.phone)}`,
      `C-2,Acme,${fresh},Closed,Refrigerator,Karachi,Sana,`,
      `C-3,Home,${local(customer.phone)},Open,TV,Lahore,Test,`,
    ].join('\n');

    const committed = await request(app.getHttpServer())
      .post('/api/v1/admin/leads/imports')
      .set('authorization', `Bearer ${marketing.token}`)
      .send({ csv: clean, fileName: 'cases.csv' });
    expect(committed.status, JSON.stringify(committed.body)).toBe(201);
    expect(committed.body.data.createdLeads).toBe(2);
    expect(committed.body.data.linkedCustomers).toBe(1);
    expect(committed.body.data.consent).toBeUndefined();
    importIds.push(committed.body.data.importId);

    const again = await request(app.getHttpServer())
      .post('/api/v1/admin/leads/imports')
      .set('authorization', `Bearer ${marketing.token}`)
      .send({ csv: clean, fileName: 'cases.csv' });
    expect(again.status).toBe(201);
    expect(again.body.data.createdLeads).toBe(0);
    expect(again.body.data.updatedLeads).toBe(2);
    importIds.push(again.body.data.importId);

    const prisma = app.get(PrismaService);
    const lead = await prisma.lead.findUniqueOrThrow({
      where: { phone: fresh },
      include: { cases: true },
    });
    expect(lead.consent).toBe('UNKNOWN');
    expect(lead.city).toBe('Lahore');
    expect(lead.productInterest).toBe('AC');
    expect(lead.cases).toHaveLength(2);

    const linked = await prisma.lead.findUniqueOrThrow({ where: { phone: customer.phone } });
    expect(linked.customerId).toBe(customer.id);

    const listed = await request(app.getHttpServer())
      .get('/api/v1/admin/leads')
      .query({ q: local(fresh) })
      .set('authorization', `Bearer ${marketing.token}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data.map((item: { phone: string }) => item.phone)).toEqual([fresh]);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/leads/${lead.id}`)
      .set('authorization', `Bearer ${marketing.token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.cases).toHaveLength(2);

    const audit = await prisma.auditLog.findFirst({ where: { entityId: committed.body.data.importId, action: 'leads.import' } });
    expect(audit?.actorId).toBe(marketing.id);
    expect(JSON.stringify(audit?.after)).not.toContain(fresh);
  });
});
