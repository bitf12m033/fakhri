import { Injectable } from '@nestjs/common';
import { LeadConsent, Prisma } from '@fakhri/prisma';
import { buildMeta, invalidInput, normalizePagination, notFound } from '@fakhri/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { currentActor } from '../../common/actor-context';
import { normalizePhone } from '../customers/phone';
import { ImportLeadsDto, ListLeadsQueryDto, OptOutLeadDto, SetConsentDto } from './leads.dto';
import { ImportPlan, ImportReport, LeadDraft, planImport } from './lead-import';

const leadSelect = {
  id: true,
  phone: true,
  firstName: true,
  lastName: true,
  contactName: true,
  accountName: true,
  city: true,
  locality: true,
  zipCode: true,
  country: true,
  productInterest: true,
  consent: true,
  consentAt: true,
  customerId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LeadSelect;

/**
 * Lead import (increment 3.10). A preview never writes. Commit writes only when
 * every row is valid, and it never sets WhatsApp consent — the sheet has no opt-in.
 */
@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async preview(dto: ImportLeadsDto): Promise<ImportReport> {
    const plan = await this.plan(dto);
    return plan.report;
  }

  async commit(
    dto: ImportLeadsDto,
  ): Promise<ImportReport & { importId: string; createdLeads: number; updatedLeads: number; linkedCustomers: number }> {
    const plan = await this.plan(dto);
    if (plan.report.invalidRows > 0) {
      throw invalidInput('The file has rows that cannot be imported', {
        invalidRows: plan.report.invalidRows,
        issues: plan.report.issues,
      });
    }

    const phones = plan.leads.map((lead) => lead.phone);
    const customers = await this.customersByPhone(phones);
    let createdLeads = 0;
    let updatedLeads = 0;
    let linkedCustomers = 0;

    const imported = await this.prisma.$transaction(async (tx) => {
      for (const draft of plan.leads) {
        const outcome = await this.upsertLead(tx, draft, customers.get(draft.phone));
        if (outcome.created) createdLeads += 1;
        else updatedLeads += 1;
        if (outcome.linked) linkedCustomers += 1;
      }

      const record = await tx.leadImport.create({
        data: {
          fileName: dto.fileName,
          createdById: currentActor()?.principal?.type === 'ADMIN' ? currentActor()?.principal?.id : undefined,
          rowCount: plan.report.rows,
          validRows: plan.report.validRows,
          invalidRows: 0,
          createdLeads,
          updatedLeads,
          linkedCustomers,
        },
      });
      await this.audit.log(
        {
          action: 'leads.import',
          entityType: 'LeadImport',
          entityId: record.id,
          after: {
            fileName: dto.fileName ?? null,
            rows: plan.report.rows,
            createdLeads,
            updatedLeads,
            linkedCustomers,
          },
        },
        tx,
      );
      return record;
    });

    return { ...plan.report, createdLeads, updatedLeads, linkedCustomers, importId: imported.id };
  }

  async list(query: ListLeadsQueryDto) {
    const { page, pageSize, skip, take } = normalizePagination(query);
    const where = this.listWhere(query);
    const [items, totalItems] = await Promise.all([
      this.prisma.lead.findMany({ where, select: leadSelect, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.lead.count({ where }),
    ]);
    return { items: items.map(serializeLead), meta: buildMeta(totalItems, skip, take) };
  }

  async setConsent(id: string, dto: SetConsentDto) {
    const lead = await this.prisma.lead.findUnique({ where: { id }, select: leadSelect });
    if (!lead) throw notFound('Lead');
    if (lead.consent === dto.consent) return serializeLead(lead);

    const updated = await this.prisma.lead.update({
      where: { id },
      data: { consent: dto.consent, consentAt: new Date() },
      select: leadSelect,
    });
    await this.audit.log({
      action: 'leads.consent',
      entityType: 'Lead',
      entityId: id,
      before: { consent: lead.consent },
      after: { consent: dto.consent },
    });
    return serializeLead(updated);
  }

  /** Record a STOP reply. The number must already be a lead. */
  async optOut(dto: OptOutLeadDto) {
    const phone = normalizePhone(dto.phone);
    const lead = await this.prisma.lead.findUnique({ where: { phone }, select: { id: true } });
    if (!lead) throw notFound('Lead');
    return this.setConsent(lead.id, { consent: LeadConsent.OPTED_OUT });
  }

  async get(id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      select: { ...leadSelect, cases: { orderBy: { createdAt: 'asc' } } },
    });
    if (!lead) throw notFound('Lead');
    const { cases, ...rest } = lead;
    return {
      ...serializeLead(rest),
      cases: cases.map((item) => ({
        id: item.id,
        caseNumber: item.caseNumber,
        status: item.status,
        comment: item.comment,
        product: item.product,
        priority: item.priority,
        owner: item.owner,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  private async plan(dto: ImportLeadsDto): Promise<ImportPlan> {
    const probed = planImport(dto.csv, { leadPhones: new Set(), customerPhones: new Set() }, dto.columns);
    const phones = probed.leads.map((lead) => lead.phone);
    const [leadPhones, customerPhones] = await Promise.all([
      this.phonesOf(this.prisma.lead, phones),
      this.phonesOf(this.prisma.customer, phones),
    ]);
    return planImport(dto.csv, { leadPhones, customerPhones }, dto.columns);
  }

  private async phonesOf(
    model: { findMany: (args: { where: { phone: { in: string[] } }; select: { phone: true } }) => Promise<{ phone: string }[]> },
    phones: string[],
  ): Promise<Set<string>> {
    if (phones.length === 0) return new Set();
    const rows = await model.findMany({ where: { phone: { in: phones } }, select: { phone: true } });
    return new Set(rows.map((row) => row.phone));
  }

  private async customersByPhone(phones: string[]): Promise<Map<string, string>> {
    if (phones.length === 0) return new Map();
    const rows = await this.prisma.customer.findMany({
      where: { phone: { in: phones } },
      select: { id: true, phone: true },
    });
    return new Map(rows.map((row) => [row.phone, row.id]));
  }

  private async upsertLead(
    tx: Prisma.TransactionClient,
    draft: LeadDraft,
    customerId: string | undefined,
  ): Promise<{ created: boolean; linked: boolean }> {
    const current = await tx.lead.findUnique({ where: { phone: draft.phone } });
    const linked = Boolean(customerId && current?.customerId == null);
    if (!current) {
      await tx.lead.create({
        data: {
          phone: draft.phone,
          firstName: draft.firstName,
          lastName: draft.lastName,
          contactName: draft.contactName,
          accountName: draft.accountName,
          city: draft.city,
          locality: draft.locality,
          zipCode: draft.zipCode,
          country: draft.country,
          productInterest: draft.productInterest,
          consent: LeadConsent.UNKNOWN,
          customerId,
          cases: { create: draft.cases.filter((item) => item.caseNumber) },
        },
      });
      return { created: true, linked: Boolean(customerId) };
    }

    await tx.lead.update({
      where: { id: current.id },
      data: {
        firstName: current.firstName ?? draft.firstName,
        lastName: current.lastName ?? draft.lastName,
        contactName: current.contactName ?? draft.contactName,
        accountName: current.accountName ?? draft.accountName,
        city: current.city ?? draft.city,
        locality: current.locality ?? draft.locality,
        zipCode: current.zipCode ?? draft.zipCode,
        country: current.country ?? draft.country,
        productInterest: current.productInterest ?? draft.productInterest,
        customerId: current.customerId ?? customerId,
      },
    });

    const caseNumbers = draft.cases.map((item) => item.caseNumber).filter((value): value is string => Boolean(value));
    const existingCases = caseNumbers.length
      ? await tx.leadCase.findMany({ where: { caseNumber: { in: caseNumbers } }, select: { caseNumber: true } })
      : [];
    const seen = new Set(existingCases.map((item) => item.caseNumber));
    const fresh = draft.cases.filter((item) => item.caseNumber && !seen.has(item.caseNumber));
    if (fresh.length > 0) {
      await tx.leadCase.createMany({
        data: fresh.map((item) => ({ ...item, leadId: current.id })),
      });
    }
    return { created: false, linked };
  }

  private listWhere(query: ListLeadsQueryDto): Prisma.LeadWhereInput {
    const where: Prisma.LeadWhereInput = {};
    if (query.consent) where.consent = query.consent;
    if (query.city) where.city = { equals: query.city, mode: 'insensitive' };
    const q = query.q?.trim();
    if (!q) return where;

    let phone: string | undefined;
    try {
      phone = normalizePhone(q);
    } catch {
      phone = undefined;
    }
    where.OR = [
      ...(phone ? [{ phone }] : []),
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
      { contactName: { contains: q, mode: 'insensitive' } },
      { accountName: { contains: q, mode: 'insensitive' } },
      { city: { contains: q, mode: 'insensitive' } },
    ];
    return where;
  }
}

function serializeLead<T extends { createdAt: Date; updatedAt: Date; consentAt: Date | null }>(lead: T) {
  return {
    ...lead,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
    consentAt: lead.consentAt ? lead.consentAt.toISOString() : null,
  };
}
